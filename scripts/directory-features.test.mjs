import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
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

test("direct Muse invitation links use validated codes and safe new-tab navigation", () => {
  assert.equal(features.museInviteUrl("DPNIHH"), "https://muse.ai/invite/DPNIHH");
  assert.equal(features.museInviteUrl("A1B2C3"), "https://muse.ai/invite/A1B2C3");
  for (const invalid of ["../../evil", "abc123", "ABCDE", "ABC1234", "ABC-23",
    "https://evil.example/invite/ABC123", null, "ABC123?redirect=evil"]) {
    assert.throws(() => features.museInviteUrl(invalid), /Invalid Muse invite code/);
  }
  assert.match(app, /openInvite\.href = features\.museInviteUrl\(item\.code\)/);
  assert.match(app, /openInvite\.target = "_blank"/);
  assert.match(app, /openInvite\.rel = "noopener noreferrer"/);
  assert.match(app, /primaryActions\.append\(copy, openInvite\)/);
  assert.match(read("assets/styles.css"), /\.card-primary-actions\{display:grid;grid-template-columns:1\.12fr 1fr/);
});

test("Facebook group sources render as group references, never @person attribution", () => {
  assert.match(app,/group = Boolean\(found\)/);
  assert.match(app,/\(source\.group \? "Group: " : "@"\)/);
  assert.match(detailJs,/\(group \? "Group: " : "@"\)/);
  assert.match(app,/View Facebook group post in/);
});

test("invite cards use two primary actions with labeled icon-only feedback and utilities", () => {
  const css=read("assets/styles.css");
  assert.match(app, /const primaryActions = el\("div", "card-primary-actions"\)/);
  assert.match(app, /primaryActions\.append\(copy, openInvite\)/);
  assert.match(app, /const utilityBar = el\("div", "card-utility-bar"\)/);
  assert.match(app, /utilityBar\.append\(quickFeedback, subActions\)/);
  assert.match(app, /actions\.append\(primaryActions, utilityBar\)/);
  assert.match(app, /details\.setAttribute\("aria-label", "View details for Muse invite code "/);
  assert.match(app, /report\.setAttribute\("aria-label", "Give feedback on Muse invite code "/);
  assert.match(app, /countLink\.setAttribute\("aria-label", "Update owner invite count for code "/);
  assert.match(app, /link\.setAttribute\("aria-label", text \+ " — report Muse invite code "/);
  assert.match(app, /link\.append\(icon\(iconName\)\)/);
  assert.match(app,/const label = copied \? " Copied" : " Copy code"/);
  assert.doesNotMatch(app,/card\.classList\.contains\("code-card-featured"\) \? " Copy again"/);
  assert.doesNotMatch(app, /link\.append\(icon\(iconName\), document\.createTextNode/);
  assert.match(app, /if \(item\.submittedBy && !item\.sourceUrl\)/);
  assert.match(css, /\.card-utility-bar\{display:flex;align-items:center;justify-content:space-between/);
  assert.match(css, /\.card-utility-link:focus-visible,\.card-quick-feedback:focus-visible/);
  assert.match(css, /\.card-quick-worked i\{color:var\(--green\)\}/);
  assert.match(css, /\.card-quick-failed i\{color:var\(--red\)\}/);
  assert.match(css, /\.card-quick-feedback,\.card-utility-link\{min-height:44px;width:44px\}/);
  assert.doesNotMatch(app, /Reported votes|thumbsUpCount|thumbsDownCount/);
});

test("quota update badge displays recorded revisions, not click counts", () => {
  const css=read("assets/styles.css");
  const published=JSON.parse(read("data/invite-records/eplus-owner-dpnihh.json"));
  assert.equal(published.code,"DPNIHH");
  const baseline=JSON.parse(read("data/quota-update-baseline.json"));
  assert.equal(published.quotaUpdateCount,undefined,
    "The trusted main preview validator must accept the historical record");
  assert.equal(baseline.DPNIHH,1,
    "Issue #14 and PR #157 document one approved update after the initial report");
  assert.match(app,/const tracked = Number\.isSafeInteger\(item\.quotaUpdateCount\)/);
  assert.match(app,/const baseline = Number\.isSafeInteger\(quotaUpdateBaselines\[item\.code\]\)/);
  assert.match(app,/const updates = tracked \+ baseline/);
  assert.match(app,/fetch\("\.\/data\/quota-update-baseline\.json"/);
  assert.match(app,/Number\.isSafeInteger\(updates\) && updates > 0/);
  assert.match(app,/updates > 99 \? "99\+" : String\(updates\)/);
  assert.match(app,/counter\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(app,/const counter = el\("span", "card-count-updates"/);
  assert.match(css,/\.card-count-updates\{[^}]*background:var\(--blue\)/);
  assert.match(css,/\.card-count-link\{position:relative\}/);
  assert.match(app,/if \(item\.submittedBy && !item\.sourceUrl\)/);
});

test("feedback report counts render only from the trusted published GitHub snapshot", () => {
  const css=read("assets/styles.css");
  assert.match(app,/fetch\("\.\/data\/feedback-counts\.json"/);
  assert.match(app,/const summary = feedbackCounts\?\.\[item\.code\]/);
  assert.match(app,/Number\.isSafeInteger\(total\) && total >= 0/);
  assert.match(app,/counter\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(css,/\.card-quick-feedback\.has-count\{width:50px/);
  assert.match(css,/\.detail-feedback-count\{padding:2px 6px/);
  assert.match(detailJs,/fetch\("\.\.\/\.\.\/data\/feedback-counts\.json"/);
  assert.match(detailJs,/snapshot\?\.source !== "reviewed-github-feedback"/);
});

test("compact card controls have smaller desktop proportions without shrinking mobile targets", () => {
  const css=read("assets/styles.css");
  assert.match(css, /\.code-card\{min-width:0;min-height:300px/);
  assert.match(css, /\.card-actions\{display:flex;flex-direction:column;gap:9px\}/);
  for (const name of ["card-copy", "card-open-invite"]) {
    const rule=css.match(new RegExp("\\."+name+"\\{([^\\n}]*)\\}"));
    assert.ok(rule, name+" CSS rule is present");
    assert.match(rule[1], /min-height:40px/);
    assert.match(rule[1], /font-size:12\.5px/);
    assert.match(rule[1], /font-weight:750/);
    assert.match(rule[1], /border-radius:10px/);
  }
  assert.match(css,/\.container\{max-width:1200px;margin-inline:auto;padding-inline:30px\}/);
  assert.match(home,/<section class="overview container" aria-label="Community statistics">/);
  assert.match(home,/<section class="directory container" id="codes"/);
  assert.doesNotMatch(css,/\.directory\.container\s*\{\s*max-width:/);
  assert.doesNotMatch(css,/\.overview\.container\s*\{\s*max-width:/);
  assert.match(css,/@media\(min-width:1081px\) and \(max-width:1279px\)\{\.cards-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}\}/);
  assert.match(css,/\.card-copy,\.card-open-invite\{min-height:44px;font-size:12px\}/);
  assert.match(css,/@media\(max-width:390px\)\{\.card-copy,\.card-open-invite\{font-size:11\.5px\}\}/);
  assert.match(css,/\.card-quick-feedback,\.card-utility-link\{min-height:44px;width:44px\}/);
});

test("every card uses the same status, source, availability and original listing-date rows", () => {
  const css=read("assets/styles.css");
  assert.match(app,/const statusRow = el\("div", "card-status-row"\)/);
  assert.match(app,/statusRow\.append\(badge, headActions\)/);
  assert.match(app,/head\.append\(name\)/);
  assert.match(app,/card\.append\(statusRow, head, contributor, info, actions\)/);
  assert.doesNotMatch(app,/card-featured-label|card-redemption/);
  assert.match(app,/document\.createTextNode\(" Availability: " \+ availability\)/);
  assert.match(app,/document\.createTextNode\(" Listed: " \+ formatDate\(item\.addedAt\)\)/);
  assert.match(app,/amount\.title = remaining/);
  assert.match(app,/remaining\.date \+ "\. Not live Muse availability\."/);
  assert.match(app,/amount\.setAttribute\("aria-label", "Availability: " \+ availability/);
  assert.match(app,/author\.title = source\.group/);
  assert.match(css,/\.card-status-row\{display:flex;align-items:center;justify-content:space-between/);
  assert.match(css,/\.card-contributor\{[^}]*flex-wrap:nowrap/);
  assert.match(css,/\.card-author\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
  assert.match(css,/\.card-subactions\{display:grid;grid-template-columns:repeat\(3,36px\)/);
  assert.match(css,/\.card-subactions\{grid-template-columns:repeat\(3,44px\);gap:5px\}/);
  // Third utility slot stays empty for non-GitHub sources; never add a dead button.
  assert.match(app,/if \(item\.submittedBy && !item\.sourceUrl\)/);
});

test("invite card colors follow a single brand-blue palette without fake success states", () => {
  const css=read("assets/styles.css");
  assert.match(css, /:root\{[^}]*--blue:#0064ff;--blue-hover:#0057dd;--blue-soft:#e8f1ff;--blue-line:#c7deff/);
  assert.match(css, /\.status-featured\{color:var\(--blue\);background:var\(--blue-soft\)/);
  assert.match(css, /\.status-owner-verified\{[^}]*color:var\(--blue\);background:var\(--blue-soft\)/);
  assert.match(css, /\.card-source\{[^}]*background:var\(--blue-soft\);color:var\(--blue\)/);
  for (const platform of ["threads","x","facebook","telegram"]) {
    assert.doesNotMatch(css,new RegExp("\\.card-source-"+platform+"\\{"),
      "platform "+platform+" must not create a competing color scheme");
  }
  assert.match(css,/\.code-card-copied \.card-copy\{background:var\(--blue-soft\);border-color:var\(--blue-line\);color:var\(--blue\)\}/);
  assert.doesNotMatch(css,/\.code-card-copied:not\(\.code-card-featured\)/);
  assert.match(css,/\.card-quick-feedback\{[^}]*background:var\(--blue-soft\);color:var\(--blue\)/);
  assert.match(css,/\.card-quick-worked i\{color:var\(--green\)\}/);
  assert.match(css,/\.card-quick-failed i\{color:var\(--red\)\}/);
  assert.match(css,/\.status-reported-working\{color:var\(--green\)/);
  assert.match(css,/\.status-reported-not-working\{color:var\(--red\)/);
  assert.match(css,/\.detail-code-panel-copied #detail-copy\{background:var\(--blue-soft\);color:var\(--blue\);border-color:var\(--blue-line\)\}/);
  assert.match(css,/\.detail-copy-note::before\{[^}]*background:var\(--blue\)/);
  assert.doesNotMatch(css,/#(?:6335a4|8252c8|e3d7ff|f1edff|865919)/i);
});

test("saved codes parse safely and remain scoped to the browser", () => {
  assert.equal(features.STORAGE_KEY, "muse-invite-hub:saved-codes:v1");
  assert.deepEqual(features.parseSaved(null), []);
  assert.deepEqual(features.parseSaved("{broken"), []);
  assert.deepEqual(features.parseSaved('{"DPNIHH":true}'), []);
  assert.deepEqual(features.parseSaved(JSON.stringify([
    "DPNIHH", "DPNIHH", "CODE12", "__proto__", "../evil", 42, null
  ])), ["DPNIHH", "CODE12"]);
  const oversized = Array.from({length: 250}, (_, i) => "CD" + String(i).padStart(4, "0"));
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
  assert.match(detailJs, /features\.quickFeedbackUrl\(detailCode, outcome, issueNumber\)/);
});

test("homepage and detail load helpers before existing scripts without altering SEO", () => {
  // Versioned preview assets avoid browser caching an earlier card layout.
  const homeHelper = home.indexOf('src="./assets/directory-features.js?v=20261117-pr251-reports"');
  const homeApp = home.indexOf('src="./assets/app.js?v=20261117-pr251-reports"');
  assert.match(home, /href="\.\/assets\/styles\.css\?v=20261117-pr251-reports"/);
  assert.match(home, /src="\.\/assets\/site-ui\.js\?v=20261117-pr251-reports"/);
  assert.ok(homeHelper > 0 && homeApp > homeHelper);
  assert.match(home, /<title>Muse Invite Hub — Share the spark<\/title>/);
  assert.match(home, /rel="canonical" href="https:\/\/muse\.eplus\.dev\/"/);
  const detail = renderDetailPage(owner);
  assert.ok(detail.indexOf('src="../../assets/directory-features.js"') <
    detail.indexOf('src="../../assets/detail.js?v=20261117-pr251-reports"'));
  assert.match(detail, /id="detail-save" type="button" aria-pressed="false" aria-label="Save Muse invite code DPNIHH" hidden/);
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
  assert.match(detailJs, /link\.dataset\.tooltip = descriptions\[outcome\]/);
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

test("detail owner-count uses the same browser dialog as homepage with immediate click binding", () => {
  const detail = renderDetailPage({...owner,feedbackIssueNumber:14});
  assert.match(detail,/class="detail-owner-count" data-feedback-outcome="count"/);
  assert.match(app,/prepareFeedback\(event, item, "count"\)/);
  assert.match(detailJs,/const countLink = document\.querySelector\("\.detail-owner-count"\)/);
  assert.match(detailJs,/\{link:countLink,outcome:"count"\}/);
  assert.match(detailJs,/features\.openFeedbackDialog\(detailCode, outcome, issueNumber, link\)/);
  assert.match(detailJs,/function refreshLinks\(\)/);
  assert.match(detailJs,/const staticMatch = \/\^https:/);
  assert.ok(detailJs.indexOf('link.addEventListener("click"') <
    detailJs.indexOf('await fetch("../../data/code-issues.json"'),
    "actions must work before Issue-map network request completes");
  const style=read("assets/styles.css");
  assert.match(style,/\.detail-feedback \.detail-quick-feedback,\.detail-feedback>a\{gap:9px\}/);
  assert.match(style,/\.footer-links a\{display:inline-flex;min-height:30px/);
  assert.match(style,/\.footer-links a:last-child:nth-child\(odd\)\{grid-column:auto\}/);
});

test("detail actions open exactly the same report dialog with a static Issue link while offline", () => {
  function link(outcome) {
    const events=new Map();
    return {
      href:"https://github.com/ePlus-DEV/muse-invite-hub/issues/14#issuecomment-new",
      dataset:outcome ? {feedbackOutcome:outcome} : {},
      addEventListener:(name,callback)=>events.set(name,callback),
      click() {
        let prevented=false;
        events.get("click")?.({preventDefault:()=>{prevented=true;}});
        return prevented;
      }
    };
  }
  const general=link();
  const ownerCount=link("count");
  const worked=link("worked");
  const failed=link("failed");
  const copy={dataset:{},addEventListener:()=>{},querySelector:()=>null};
  const code={textContent:"DPNIHH"};
  const live={textContent:""};
  const calls=[];
  const featuresMock={
    issueNumberFor:()=>null,
    quickFeedbackUrl:(invite,outcome,num)=>features.quickFeedbackUrl(invite,outcome,num),
    openFeedbackDialog:(invite,outcome,num,trigger)=>{
      calls.push({invite,outcome,num,trigger});
      return true;
    }
  };
  const document={
    getElementById:id=>({
      "detail-copy":copy,"detail-code":code,"detail-live":live
    })[id]||null,
    querySelector:selector=>({
      ".detail-feedback > a":general,
      ".detail-owner-count":ownerCount
    })[selector]||null,
    querySelectorAll:selector=>selector===".detail-quick-feedback" ?
      [worked,failed] : []
  };
  runInNewContext(detailJs,{
    window:{MuseDirectoryFeatures:featuresMock},
    document,
    // A slow or offline Issue-map fetch must not block registering button handlers.
    fetch:()=>new Promise(()=>{})
  });
  for (const [target,outcome] of [
    [ownerCount,"count"],[general,"other"],[worked,"worked"],[failed,"failed"]
  ]) {
    assert.equal(target.click(),true);
    assert.equal(calls.at(-1).invite,"DPNIHH");
    assert.equal(calls.at(-1).outcome,outcome);
    assert.equal(calls.at(-1).num,14);
    assert.equal(calls.at(-1).trigger,target);
    assert.equal(target.href,
      "https://github.com/ePlus-DEV/muse-invite-hub/issues/14#issuecomment-new");
  }
});

test("editable feedback dialog prepares a report and reuses the linked Issue without auto-submitting", () => {
  const helper = read("assets/directory-features.js");
  const style = read("assets/styles.css");
  assert.equal(typeof features.openFeedbackDialog, "function");
  assert.match(helper, /document\.createElement\("dialog"\)/);
  assert.match(helper, /dialog\.showModal\(\)/);
  assert.match(helper, /feedbackComment\(code, outcome\)\.replace/);
  assert.match(helper, /textarea\.maxLength = 3000/);
  assert.match(helper, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(helper, /open\.href = quickFeedbackUrl\(code, outcome, issueNumber\)/);
  assert.match(helper, /"Copy comment"/);
  assert.match(helper, /"Open original Issue"/);
  assert.match(helper, /"aria-labelledby"/);
  assert.match(helper, /"aria-live"/);
  assert.doesNotMatch(helper, /fetch\([^)]*POST|method:\s*["']POST/);
  assert.match(app, /features\.openFeedbackDialog\(item\.code, outcome, number, event\.currentTarget\)/);
  assert.match(app, /report\.addEventListener\("click", event => prepareFeedback/);
  assert.match(detailJs, /features\.openFeedbackDialog\(detailCode, outcome, issueNumber, link\)/);
  assert.match(detailJs, /feedbackLink \? \[\{link:feedbackLink,outcome:"other"\}\]/);
  assert.match(style, /\.feedback-dialog::backdrop/);
  assert.match(style, /@media\(max-width:620px\)\{\.feedback-dialog-body/);

  const detail = renderDetailPage({...owner,feedbackIssueNumber:14});
  assert.match(detail, /https:\/\/github\.com\/ePlus-DEV\/muse-invite-hub\/issues\/14#issuecomment-new/);
  const feedbackSection = detail.split('class="detail-info-card detail-feedback"')[1].split("</aside>")[0];
  assert.doesNotMatch(feedbackSection, /issues\/new\?/);
});

test("owner-count comment requires real, consistent figures before Safari copy", () => {
  const template = features.feedbackComment("DPNIHH", "count");
  const blank = features.prepareOwnerCountComment(template);
  assert.match(blank.error, /Enter your actual Remaining invites/);
  const remainingOnly = features.prepareOwnerCountComment(
    template.replace("[enter actual number or leave blank]", "0")
  );
  assert.equal(remainingOnly.error, undefined);
  assert.match(remainingOnly.text, /Remaining invites: 0/);
  assert.doesNotMatch(remainingOnly.text, /\[optional\]|\[enter actual number/);
  assert.match(remainingOnly.text, /Owner confirmation: I confirm these figures/);

  const totalUsed = features.prepareOwnerCountComment(template
    .replace("Total invites: [optional]", "Total invites: 30")
    .replace("Used invites: [optional]", "Used invites: 27"));
  assert.equal(totalUsed.error, undefined);
  assert.match(totalUsed.text, /Total invites: 30/);

  for (const invalid of [
    template.replace("Total invites: [optional]", "Total invites: 30"),
    template.replace("[enter actual number or leave blank]", "-1"),
    template.replace("[enter actual number or leave blank]", "1001"),
    template.replace("Total invites: [optional]", "Total invites: 5")
      .replace("Used invites: [optional]", "Used invites: 6"),
    template.replace("[enter actual number or leave blank]", "8")
      .replace("Total invites: [optional]", "Total invites: 10")
      .replace("Used invites: [optional]", "Used invites: 1"),
    template.replace("Remaining invites: [enter actual number or leave blank]",
      "Remaining invites: 2\nRemaining invites: 3")
  ]) {
    assert.equal(typeof features.prepareOwnerCountComment(invalid).error, "string");
  }

  const helper = read("assets/directory-features.js");
  assert.match(helper, /document\.execCommand\("copy"\) === true/);
  assert.match(helper, /textarea\.setSelectionRange\(0, textarea\.value\.length\)/);
  assert.match(helper, /Automatic copy was blocked\. Long-press/);
  assert.match(helper, /Enter your actual Remaining invites number, or both Total invites and Used invites/);
});

test("guided mobile owner count fields generate the canonical GitHub report", () => {
  const report = features.ownerCountComment("DPNIHH", "3", "", "");
  assert.match(report, /^Code: DPNIHH\nUpdate type: Owner count\nRemaining invites: 3/m);
  const preparedRemaining = features.prepareOwnerCountComment(report);
  assert.equal(preparedRemaining.error, undefined);
  assert.match(preparedRemaining.text, /Remaining invites: 3/);
  const detailed = features.prepareOwnerCountComment(
    features.ownerCountComment("DPNIHH", "", "30", "27")
  );
  assert.equal(detailed.error, undefined);
  assert.match(detailed.text, /Total invites: 30/);
  assert.match(detailed.text, /Used invites: 27/);
  assert.match(detailed.text, /Owner confirmation: I confirm these figures/);

  const helper = read("assets/directory-features.js");
  const style = read("assets/styles.css");
  assert.match(helper, /remainingInput\.inputMode = "numeric"/);
  assert.match(helper, /remainingInput\.placeholder = "e\.g\. 3"/);
  assert.match(helper, /optionalSummary\.textContent = "Have total and used counts\? \(optional\)"/);
  assert.match(helper, /commentEditor\.open = !isCount/);
  assert.match(helper, /textarea\.value = isCount \? ownerCountComment\(code\)/);
  assert.match(helper, /copy\.textContent = isCount \? "Copy report" : "Copy comment"/);
  assert.match(helper, /countFields\.hidden = !isCount/);
  assert.match(style, /\.feedback-count-fields\[hidden\]\{display:none\}/);
  assert.match(style, /\.feedback-count-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("homepage token potential totals only dated reported remaining uses", () => {
  const sample = [
    {code:"WITH11", usageReportedAt:"2026-11-14", reportedCapacity:30, reportedUses:5},
    {code:"WITH12", usageReportedAt:"2026-11-15", reportedRemaining:10},
    {code:"ZERO11", usageReportedAt:"2026-11-15", reportedRemaining:0},
    {code:"UNKNWN"}, // Never assume 20 or 30 remaining by default.
    {code:"STALE1", reportedRemaining:20}, // A missing report date is unknown.
    {code:"INVALD", usageReportedAt:"2026-11-15", reportedCapacity:30, reportedUses:99}
  ];
  const potential = features.tokenPotential(sample);
  assert.deepEqual(potential,{
    reportedCodes:3,unknownCodes:3,remainingUses:35,potentialBillions:35
  });
  assert.deepEqual(features.tokenPotential([]),{
    reportedCodes:0,unknownCodes:0,remainingUses:0,potentialBillions:0
  });
  assert.deepEqual(features.tokenPotential(null),{
    reportedCodes:0,unknownCodes:0,remainingUses:0,potentialBillions:0
  });
  assert.match(home, /id="stat-tokens">—<\/strong>/);
  assert.match(home, /id="stat-token-context"/);
  assert.match(home, /1 billion tokens per eligible redemption/);
  assert.match(home, /not live availability or guaranteed rewards/);
  assert.match(app, /features\.tokenPotential\(codes\)/);
  assert.match(app, /potential\.unknownCodes/);
  const styles=read("assets/styles.css");
  assert.match(styles, /overview-shell\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styles, /overview-shell\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);padding:12px\}/);
});

test("four homepage statistics retain readable mobile 2x2 spacing", () => {
  const style=read("assets/styles.css");
  assert.equal((home.match(/class="overview-stat"/g)||[]).length,4);
  assert.match(style,/\.overview-stat:nth-child\(3\)\{border-left:0\}/);
  assert.match(style,/\.overview-stat:nth-child\(-n\+2\)\{border-bottom:1px solid var\(--line\)\}/);
  assert.match(style,/\.overview-stat\{gap:6px;min-height:116px;padding:14px 8px;flex-direction:column;text-align:center\}/);
  assert.match(style,/\.overview-stat>div\{min-width:0;gap:3px\}/);
  assert.match(style,/\.overview-stat span\{font-size:11px;line-height:1.35\}/);
  assert.match(style,/\.overview-note,\.overview-source\{font-size:11px;line-height:1.55;margin-inline:5px;text-align:left\}/);
  assert.doesNotMatch(style,/\.overview-stat\{gap:5px;min-height:64px/);
});


test("browser feedback and local bookmarks reject bad-length or hyphenated Muse codes",()=>{
  assert.deepEqual(features.parseSaved(JSON.stringify([
    "ABCDE","ABCDEFG","ABC-12","ABC_12","ABC123"
  ])),["ABC123"]);
  for(const bad of ["ABCDE","ABCDEFG","ABC-12"]){
    assert.throws(()=>features.quickFeedbackUrl(bad,"worked",14),/Invalid public invite code/);
    assert.equal(features.issueNumberFor({[bad]:14},bad),null);
  }
  assert.equal(features.issueNumberFor({ABC123:14},"ABC123"),14);
});
