import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { renderDetailPage } from "./site-pages.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const home = read("index.html");
const css = read("assets/styles.css");
const source = read("assets/site-ui.js");
const sample = {
  id: "test-invite", code: "DPNIHH", status: "unverified",
  addedAt: "2026-11-11", submittedBy: "hoangsvit",
  ownerConfirmed: true, featured: true
};

function createBrowser({ hash = "", loading = false, reduced = false, readyState = "complete", detail = false } = {}) {
  const listeners = new Map();
  const windowListeners = new Map();
  const linkListeners = new Map();
  const topListeners = new Map();
  const calls = { aboutScrolls: [], topScrolls: [], observers: [], footerObservers: [] };
  let loadingState = loading;
  const disclosure = { open: false };
  const about = detail ? null : {
    querySelector: name => name === "details.help-disclosure" ? disclosure : null,
    scrollIntoView: options => calls.aboutScrolls.push(options)
  };
  const top = {
    hidden: true,
    addEventListener: (type, cb) => topListeners.set(type, cb)
  };
  const link = { addEventListener: (type, cb) => linkListeners.set(type, cb) };
  const footer = { className: "site-footer" };
  const document = {
    readyState,
    documentElement: { classList: { contains: name => name === "is-page-loading" && loadingState } },
    getElementById: id => id === "about" ? about : id === "back-to-top" ? top : null,
    querySelector: selector => selector === ".site-footer" ? footer : null,
    querySelectorAll: selector => selector === 'a[href="#about"]' && !detail ? [link] : [],
    addEventListener: (type, cb) => listeners.set(type, cb)
  };
  const window = {
    location: { hash }, scrollY: 0,
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: cb => cb(),
    scrollTo: options => calls.topScrolls.push(options),
    addEventListener: (type, cb) => windowListeners.set(type, cb)
  };
  class MockMutationObserver {
    constructor(callback) { this.callback = callback; calls.observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  class MockIntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; calls.footerObservers.push(this); }
    observe(target) { this.target = target; }
  }
  runInNewContext(source, { window, document, MutationObserver: MockMutationObserver,
    IntersectionObserver: MockIntersectionObserver });
  return {
    window, document, disclosure, top, calls,
    triggerDoc: type => listeners.get(type)?.(),
    triggerWindow: type => windowListeners.get(type)?.(),
    clickAbout: () => linkListeners.get("click")?.(),
    clickTop: () => topListeners.get("click")?.(),
    setFooterVisible: value => {
      for (const observer of calls.footerObservers) {
        observer.callback([{ isIntersecting:value }]);
      }
    },
    finishLoading: () => {
      loadingState = false;
      calls.observers.forEach(observer => observer.callback());
    }
  };
}

test("About has a visible target, expandable instructions, and a deep-link route from code details", () => {
  assert.match(home, /href="#about"/);
  assert.match(home, /<section class="help-section container" id="about" aria-labelledby="about-title">/);
  assert.match(home, /<h2 class="about-title" id="about-title">About Muse Invite Hub<\/h2>/);
  assert.match(home, /<details class="help-disclosure">/);
  const detail = renderDetailPage(sample);
  assert.match(detail, /href="\.\.\/\.\.\/#about"/);
  assert.match(detail, /src="\.\.\/\.\.\/assets\/site-ui.js" defer/);
  assert.match(home, /src="\.\/assets\/site-ui.js" defer/);
});

test("About opens when directly loaded with #about, then scrolls after full-page skeleton clears", () => {
  const browser = createBrowser({ hash: "#about", loading: true });
  assert.equal(browser.disclosure.open, true);
  assert.equal(browser.calls.aboutScrolls.length, 0, "do not scroll hidden content");
  assert.equal(browser.calls.observers.length, 1);
  browser.finishLoading();
  assert.equal(browser.calls.aboutScrolls.length, 1);
  assert.equal(browser.calls.aboutScrolls[0].block, "start");
  assert.equal(browser.calls.observers[0].disconnected, true);
});

test("About opens again for repeated click on same hash, and honors reduced motion", () => {
  const browser = createBrowser({ reduced: true });
  browser.window.location.hash = "#about";
  browser.clickAbout();
  assert.equal(browser.disclosure.open, true);
  assert.equal(browser.calls.aboutScrolls[0].behavior, "auto");
  browser.disclosure.open = false;
  browser.triggerWindow("hashchange");
  assert.equal(browser.disclosure.open, true);
  assert.equal(browser.calls.aboutScrolls.length, 2);
});

test("Back to top is only shown after scrolling and honors reduced motion", () => {
  const browser = createBrowser({ reduced: true });
  assert.equal(browser.top.hidden, true);
  browser.window.scrollY = 480;
  browser.triggerWindow("scroll");
  assert.equal(browser.top.hidden, false);
  browser.clickTop();
  assert.equal(browser.calls.topScrolls.length, 1);
  assert.equal(browser.calls.topScrolls[0].top, 0);
  assert.equal(browser.calls.topScrolls[0].behavior, "auto");
  browser.window.scrollY = 0;
  browser.triggerWindow("scroll");
  assert.equal(browser.top.hidden, true);
});

test("floating Back to top never covers footer links on desktop or mobile", () => {
  const browser = createBrowser({ detail: true });
  assert.equal(browser.calls.footerObservers.length, 1);
  assert.equal(browser.calls.footerObservers[0].target.className, "site-footer");
  browser.window.scrollY = 1200;
  browser.triggerWindow("scroll");
  assert.equal(browser.top.hidden, false);
  browser.setFooterVisible(true);
  assert.equal(browser.top.hidden, true);
  browser.setFooterVisible(false);
  assert.equal(browser.top.hidden, false);
  browser.clickTop();
  assert.equal(browser.calls.topScrolls.at(-1).top, 0);
});

test("Navigation also initializes when script executes before DOMContentLoaded", () => {
  const browser = createBrowser({ hash: "#about", readyState: "loading" });
  assert.equal(browser.disclosure.open, false);
  browser.triggerDoc("DOMContentLoaded");
  assert.equal(browser.disclosure.open, true);
  assert.equal(browser.calls.aboutScrolls.length, 1);
});

test("Footer layout, links and back-to-top button are shared by home/detail; SEO is untouched", () => {
  const detail = renderDetailPage(sample);
  for (const html of [home, detail]) {
    assert.match(html, /class="footer-main-row"/);
    assert.match(html, /class="footer-brand"/);
    assert.match(html, /<nav class="footer-links" aria-label="Footer navigation">/);
    assert.match(html, /class="footer-tagline">Small gestures\. Bigger possibilities\./);
    assert.match(html, /class="container footer-bottom"/);
    assert.match(html, /Independent project · Not affiliated with Meta or Muse/);
    assert.match(html, /id="back-to-top" type="button" aria-label="Back to top"[^>]*hidden>/);
    assert.match(html, /Official Muse/);
    assert.match(html, /Contribute/);
  }
  assert.match(home, /<title>Muse Invite Hub — Share the spark<\/title>/);
  assert.match(home, /<link rel="canonical" href="https:\/\/muse\.eplus\.dev\/"/);
  assert.match(home, /G-N1MZ8YLNLJ/);
  assert.match(detail, /<meta name="robots" content="index,follow">/);
  assert.match(detail, /rel="canonical" href="https:\/\/muse\.eplus\.dev\/codes\/DPNIHH\/"/);
  assert.match(css, /\.footer-main-row\{display:flex;align-items:center;justify-content:space-between/);
  assert.match(css, /\.footer-bottom\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /\.footer-bottom\{grid-template-columns:1fr;gap:11px\}/);
  assert.match(css, /\.back-to-top\{position:fixed/);
  assert.match(css, /\.help-section\{[^}]*scroll-margin-top:90px/);
});
