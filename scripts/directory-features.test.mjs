import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { renderDetailPage } from "./site-pages.mjs";

const require = createRequire(import.meta.url);
const features = require("../assets/directory-features.js");
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const home = read("index.html");
const app = read("assets/app.js");
const detailJs = read("assets/detail.js");
const form = read(".github/ISSUE_TEMPLATE/report-code.yml");
const owner = {
  id: "owner-demo", code: "DPNIHH", status: "unverified",
  ownerConfirmed: true, featured: true, submittedBy: "hoangsvit", addedAt: "2026-11-11"
};

test("saved codes parse safely and remain scoped to the browser", () => {
  assert.equal(features.STORAGE_KEY, "muse-invite-hub:saved-codes:v1");
  assert.deepEqual(features.parseSaved(null), []);
  assert.deepEqual(features.parseSaved("{broken"), []);
  assert.deepEqual(features.parseSaved('{"DPNIHH":true}'), []);
  assert.deepEqual(features.parseSaved(JSON.stringify([
    "DPNIHH", "DPNIHH", "CODE123", "__proto__", "../evil", 42, null
  ])), ["DPNIHH", "CODE123"]);
  const oversized = Array.from({length: 250}, (_, i) => "CODE" + String(i).padStart(3, "0"));
  assert.equal(features.parseSaved(JSON.stringify(oversized)).length, features.MAX_SAVED);
  assert.match(app, /window\.localStorage\.setItem\(features\.STORAGE_KEY/);
  assert.match(app, /window\.addEventListener\("storage"/);
  assert.match(app, /sourceFilter === "saved" \? savedCodes\.has\(item\.code\)/);
  assert.match(app, /savedFilter\.focus\(\)/);
  assert.match(home, /id="saved-filter"/);
  assert.match(home, /id="saved-count"/);
  assert.match(read("assets/styles.css"), /\.card-save\[aria-pressed="true"\]/);
});

test("recently updated sorting uses recorded dates, not invented live status", () => {
  const sample = [
    {code: "AAAA11", addedAt: "2026-11-12"},
    {code: "BBBB22", addedAt: "2026-11-10", usageReportedAt: "2026-11-13"},
    {code: "CCCC33", addedAt: "2026-11-11", checkedAt: "2026-11-14"},
    {code: "DDDD44", addedAt: "2026-11-15", featured: true}
  ];
  assert.equal(features.activityDate(sample[1]), "2026-11-13");
  assert.equal(features.activityDate(sample[2]), "2026-11-14");
  assert.equal(features.activityDate({addedAt:"2026-11-12", usageReportedAt:"2026-11-09"}), "2026-11-12");
  assert.deepEqual(sample.slice().sort((a,b)=>features.compareCodes(a,b,"updated")).map(x=>x.code),
    ["DDDD44", "CCCC33", "BBBB22", "AAAA11"]);
  assert.deepEqual(sample.slice().sort((a,b)=>features.compareCodes(a,b,"newest")).map(x=>x.code),
    ["DDDD44", "AAAA11", "CCCC33", "BBBB22"]);
  assert.deepEqual(sample.slice().sort((a,b)=>features.compareCodes(a,b,"oldest")).map(x=>x.code),
    ["DDDD44", "BBBB22", "CCCC33", "AAAA11"]);
  assert.equal((home.match(/role="menuitemradio"/g) || []).length, 4);
  assert.match(home, /data-sort="updated" aria-checked="false"/);
  assert.match(home, /data-sort="newest" aria-checked="true"/);
  assert.match(app, /features\.compareCodes\(a, b, sortValue\)/);
});

test("quick feedback links to existing canonical Issue and suggests editable comments", () => {
  for (const [kind,label] of [["worked","Muse accepted"],["failed","Muse rejected"]]) {
    const target = new URL(features.quickFeedbackUrl("DPNIHH",kind,73));
    assert.equal(target.origin,"https://github.com");
    assert.equal(target.pathname,"/ePlus-DEV/muse-invite-hub/issues/73");
    assert.equal(target.hash,"#issuecomment-new");
    assert.match(features.feedbackComment("DPNIHH",kind),new RegExp(label));
    assert.match(features.feedbackComment("DPNIHH",kind),/add date/);
    const fallback = new URL(features.quickFeedbackUrl("DPNIHH",kind));
    assert.equal(fallback.pathname, "/ePlus-DEV/muse-invite-hub/issues");
    assert.equal(fallback.searchParams.has("template"),false);
  }
  assert.equal(features.issueNumberFor({DPNIHH:73},"DPNIHH"),73);
  assert.equal(features.issueNumberFor({DPNIHH:"73"},"DPNIHH"),null);
  assert.throws(()=>features.quickFeedbackUrl("../evil","worked",73),/Invalid/);
  assert.throws(()=>features.quickFeedbackUrl("DPNIHH","fake",73),/Invalid/);
  assert.match(app, /feedbackIssue\(item\.code, outcome\)/);
  assert.match(app, /link\.target = "_blank"/);
  assert.match(app, /card-feedback-actions/);
  assert.match(detailJs, /features\.quickFeedbackUrl\(detailCode, outcome, number\)/);
});

test("homepage and detail load helpers before existing scripts without altering SEO", () => {
  const homeHelper = home.indexOf('src="./assets/directory-features.js"');
  const homeApp = home.indexOf('src="./assets/app.js"');
  assert.ok(homeHelper > 0 && homeApp > homeHelper);
  assert.match(home, /<title>Muse Invite Hub — Share the spark<\/title>/);
  assert.match(home, /rel="canonical" href="https:\/\/muse\.eplus\.dev\/"/);
  const detail = renderDetailPage(owner);
  assert.ok(detail.indexOf('src="../../assets/directory-features.js"') <
    detail.indexOf('src="../../assets/detail.js"'));
  assert.match(detail, /id="detail-save" type="button" aria-pressed="false" hidden/);
  assert.match(detail, /data-feedback-outcome="worked"/);
  assert.match(detail, /data-feedback-outcome="failed"/);
  assert.match(detail, /<meta name="robots" content="index,follow">/);
  assert.match(detail, /rel="canonical" href="https:\/\/muse\.eplus\.dev\/codes\/DPNIHH\/"/);
  assert.match(detailJs, /features\.parseSaved\(window\.localStorage\.getItem/);
  assert.match(detailJs, /window\.addEventListener\("storage"/);
});


test("contextual tooltips cover saved, quick feedback, copy, details and recently updated", () => {
  const css = read("assets/styles.css");
  const helper = read("assets/directory-features.js");
  assert.match(home, /id="saved-filter"[^>]*data-tooltip="Show bookmarked codes/);
  assert.match(home, /data-sort="updated"[^>]*data-tooltip="Latest recorded listing/);
  assert.match(home, /id="sort-trigger"[^>]*data-tooltip="Sort the directory/);
  assert.match(app, /button\.dataset\.tooltip = saved \?/);
  assert.match(app, /copy\.dataset\.tooltip = "Copy this code/);
  assert.match(app, /details\.dataset\.tooltip = "See the source/);
  assert.match(app, /report\.dataset\.tooltip = "Comment on this code/);
  assert.match(app, /link\.dataset\.tooltip = outcome === "worked"/);
  assert.match(detailJs, /detailSave\.dataset\.tooltip = active \?/);
  assert.match(detailJs, /genericFeedback\.dataset\.tooltip/);
  assert.match(detailJs, /link\.dataset\.tooltip = outcome === "worked"/);
  assert.match(helper, /tip\.setAttribute\("role", "tooltip"\)/);
  assert.match(helper, /tip\.textContent = target\.dataset\.tooltip/);
  assert.doesNotMatch(helper, /tip\.innerHTML\s*=/);
  assert.match(helper, /setAttribute\("aria-describedby"/);
  assert.match(helper, /document\.addEventListener\("pointerover"/);
  assert.match(helper, /document\.addEventListener\("focusin"/);
  assert.match(helper, /document\.addEventListener\("pointerdown"/);
  assert.match(helper, /event\.key === "Escape"/);
  assert.match(helper, /window\.setTimeout\(hide, 2400\)/);
  assert.match(css, /#muse-action-tooltip\{position:fixed;z-index:1000/);
  assert.match(css, /#muse-action-tooltip\[hidden\]\{display:none!important\}/);
  const detail = renderDetailPage(owner);
  assert.match(detail, /id="detail-save"/);
  assert.match(detail, /class="detail-quick-feedback"/);
  assert.match(detail, /src="\.\.\/\.\.\/assets\/directory-features.js"/);
});
