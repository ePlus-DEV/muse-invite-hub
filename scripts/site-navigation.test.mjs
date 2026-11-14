import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { renderDetailPage } from "./site-pages.mjs";
import { renderSiteHeader } from "./site-navigation.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sample = {
  id: "test-invite", code: "DPNIHH", status: "unverified",
  addedAt: "2026-11-11", submittedBy: "hoangsvit",
  ownerConfirmed: true, featured: true
};
const variants = [
  {name: "home", html: read("index.html"), prefix: "./", current: "home"},
  {name: "country map", html: read("countries/index.html"), prefix: "../", current: "countries"},
  {name: "invite detail", html: renderDetailPage(sample), prefix: "../../", current: "detail"}
];

test("home, country map and generated details share canonical, identical navigation", () => {
  for (const {name, html, prefix, current} of variants) {
    const actual = html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
    assert.ok(actual, name + ": header missing");
    assert.equal(actual.trim(), renderSiteHeader({prefix, current}).trim(),
      name + ": header drifted from canonical navigation renderer");
    assert.match(actual, /id="site-nav" aria-label="Main navigation"/);
    assert.match(actual, /aria-controls="site-nav"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-controls="site-nav"/);
    assert.match(actual, /Share code<\/a>/);
    assert.match(actual, /<i class="fa-solid fa-house" aria-hidden="true"><\/i> Home/);
    assert.match(actual, /<i class="fa-regular fa-circle-question" aria-hidden="true"><\/i> About/);
    assert.match(html, /assets\/site-ui\.js" defer/);
  }
  const primary = variants.map(({html}) => html.match(/<nav class="nav-links"[\s\S]*?<\/nav>/)?.[0]);
  const visibleLabels = menu => [...menu.matchAll(/<\/i>\s*(Home|Country map|About|GitHub|Share code)<\/a>/g)].map(m => m[1]);
  assert.deepEqual(visibleLabels(primary[0]), ["Home", "Country map", "About", "GitHub", "Share code"]);
  for (const menu of primary.slice(1)) assert.deepEqual(visibleLabels(menu), visibleLabels(primary[0]));
});

test("mobile dropdown is progressive, keyboard accessible and closes on navigation/outside/resize", () => {
  const source = read("assets/site-ui.js");
  const css = read("assets/styles.css");
  assert.match(css, /\.site-header\.nav-enhanced \.nav-links:not\(\.is-open\)\{display:none\}/);
  assert.match(css, /\.site-header\.nav-enhanced \.nav-toggle\{display:inline-flex\}/);
  assert.match(css, /\.nav-links \.nav-mobile-share\{display:flex/);
  let focused = 0;
  const bind = () => {
    const members = new Set();
    return {
      add: key => members.add(key),
      remove: key => members.delete(key),
      contains: key => members.has(key),
      toggle(key, enabled) { if (enabled) members.add(key); else members.delete(key); }
    };
  };
  const headerClass = bind(), navClass = bind(), toggleAttributes = new Map([["aria-expanded","false"]]);
  const callbacks = {}, docCallbacks = {}, winCallbacks = {};
  const toggle = {
    setAttribute: (name, value) => toggleAttributes.set(name, value),
    addEventListener: (name, fn) => { callbacks["toggle:"+name] = fn; },
    focus: () => {focused++;}
  };
  const nav = {
    classList: navClass,
    addEventListener: (name, fn) => { callbacks["nav:"+name] = fn; }
  };
  const header = {
    classList: headerClass,
    contains: element => element === toggle || element === nav,
    querySelector: selector => selector === ".nav-links" ? nav : selector === ".nav-toggle" ? toggle : null
  };
  const document = {
    readyState: "complete",
    getElementById: () => null,
    querySelector: selector => selector === ".site-header" ? header : null,
    addEventListener: (name, fn) => {docCallbacks[name] = fn;}
  };
  const window = {
    innerWidth: 375,
    addEventListener: (name, fn) => {winCallbacks[name] = fn;}
  };
  runInNewContext(source, {document, window});
  assert.ok(headerClass.contains("nav-enhanced"));
  const open = () => callbacks["toggle:click"]();
  open();
  assert.ok(navClass.contains("is-open"));
  assert.equal(toggleAttributes.get("aria-expanded"), "true");
  open();
  assert.equal(toggleAttributes.get("aria-expanded"), "false");
  open();
  docCallbacks.pointerdown({target: {}});
  assert.ok(!navClass.contains("is-open"));
  open();
  callbacks["nav:click"]({target:{closest: name => name === "a" ? {} : null}});
  assert.ok(!navClass.contains("is-open"));
  open();
  docCallbacks.keydown({key: "Escape"});
  assert.ok(!navClass.contains("is-open"));
  assert.equal(focused, 1);
  open();
  window.innerWidth = 1200;
  winCallbacks.resize();
  assert.ok(!navClass.contains("is-open"));
});
