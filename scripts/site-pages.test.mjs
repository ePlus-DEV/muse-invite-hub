import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canIndexDetail, codePath, renderDetailPage, generateSitemap, generateSite, PAGE_SIZE } from "./site-pages.mjs";

const owner = () => ({
  id: "owner-1", code: "DPNIHH", featured: true, ownerConfirmed: true,
  submittedBy: "hoangsvit", addedAt: "2026-11-11", usageReportedAt: "2026-11-11",
  status: "unverified", reportedCapacity: 30, reportedUses: 27,
  note: "Owner-confirmed; redemption is not independently tested."
});
const community = () => ({
  id: "community-1", code: "TEST42", submittedBy: "community",
  status: "unverified", addedAt: "2026-11-11",
  note: "Community-shared; availability not verified."
});
test("directory and static generator use the same Load more batch size", () => {
  const source = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  assert.match(source, new RegExp("const PAGE_SIZE = " + PAGE_SIZE + ";"));
  assert.match(source, /visible\.slice\(0, displayLimit\)/);
  assert.match(source, /render\(true\)/);
});
test("detail links are predictable and safely validated", () => {
  assert.equal(codePath("DPNIHH"), "/codes/DPNIHH/");
  assert.throws(() => codePath("../DPNIHH"), /Invalid/);
  assert.equal(PAGE_SIZE, 12);
});
test("owner detail is HTML with canonical, status, structured data and dated quota", () => {
  const html = renderDetailPage(owner());
  assert.match(html, /<title>DPNIHH Muse Invite Code \| Muse Invite Hub<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/muse.eplus.dev\/codes\/DPNIHH\/"/);
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /Verified Owner/);
  assert.match(html, /<dt>Code owner<\/dt><dd><span class="detail-owner-confirmed"/);
  assert.match(html, /Verified Owner \(ePlus\.DEV\)/);
  assert.match(html, /<dt>Muse redemption<\/dt><dd>Not independently confirmed by Muse/);
  assert.doesNotMatch(html, /<dt>Redemption status<\/dt><dd>Unverified/);
  assert.match(html, /3 \/ 30/);
  assert.match(html, /Not live/);
  assert.match(html, /"BreadcrumbList"/);
  assert.match(html, /"WebPage"/);
  assert.match(html, /href="\.\.\/\.\.\/assets\/styles.css"/);
  assert.match(html, /href="https:\/\/muse.ai\/join"/);
  assert.doesNotMatch(html, /Muse has verified this code/);
});
test("confirmed owner card and non-owner detail keep verification meanings separate", () => {
  const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../assets/styles.css", import.meta.url), "utf8");
  assert.match(app, /ownerConfirmed \? "Verified Owner" : featured \? "Featured"/);
  assert.match(app, /status-owner-verified/);
  assert.match(app, /Muse redemption not independently confirmed/);
  assert.match(css, /\.status-owner-verified\{/);
  assert.match(css, /\.card-redemption\{/);
  const communityHtml = renderDetailPage(community());
  assert.doesNotMatch(communityHtml, /Verified Owner \(ePlus\.DEV\)/);
  assert.match(communityHtml, /<dt>Muse redemption<\/dt><dd>Not independently confirmed by Muse/);
});

test("all published invite details, including unverified codes, are indexable and in the sitemap", () => {
  const html = renderDetailPage(community());
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /rel="canonical" href="https:\/\/muse.eplus.dev\/codes\/TEST42\/"/);
  assert.match(html, /Not reported/);
  assert.match(html, /redemption has not been verified/i);
  assert.equal(canIndexDetail(community()), true);
  const sitemap = generateSitemap([owner(), community()]);
  assert.match(sitemap, /\/codes\/DPNIHH\//);
  assert.match(sitemap, /\/codes\/TEST42\//);
  assert.match(sitemap, /https:\/\/muse.eplus.dev\/<\/loc>/);
});
test("preview detail remains noindex despite all production codes being indexable", () => {
  const html = renderDetailPage(owner(), {
    preview: true, origin: "https://muse.eplus.dev", basePath: "/pr-preview/pr-17/"
  });
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.match(html, /https:\/\/muse.eplus.dev\/pr-preview\/pr-17\/codes\/DPNIHH\//);
  assert.match(html, /href="\.\.\/\.\.\/assets\/styles.css"/);
});
test("unsafe notes and contributor names are escaped in HTML and JSON-LD", () => {
  const item = { ...community(), note: '<img src=x onerror="alert(1)">', submittedBy: '<script>' };
  const html = renderDetailPage(item);
  assert.doesNotMatch(html, /<img src=x onerror/);
  assert.doesNotMatch(html, /<script><\/script>/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
});
test("generateSite creates all detail pages and a sitemap for every published code", () => {
  const dir = mkdtempSync(join(tmpdir(), "muse-static-detail-"));
  try {
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data", "invites.json"), JSON.stringify([owner(), community()]));
    const result = generateSite(dir);
    assert.deepEqual(result, { created: 2, indexed: 2 });
    assert.match(readFileSync(join(dir, "codes", "DPNIHH", "index.html"), "utf8"), /Verified Owner/);
    assert.match(readFileSync(join(dir, "codes", "TEST42", "index.html"), "utf8"), /index,follow/);
    const map = readFileSync(join(dir, "sitemap.xml"), "utf8");
    assert.match(map, /DPNIHH/);
    assert.match(map, /TEST42/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("header, footer, favicon and nav use the same logo asset on home and detail pages", () => {
  const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const favicon = readFileSync(new URL("../assets/favicon.svg", import.meta.url), "utf8");
  const detail = renderDetailPage(owner());
  const preview = renderDetailPage(owner(), {
    preview: true, basePath: "/pr-preview/pr-25/"
  });
  assert.match(favicon, /viewBox="0 0 64 64"/);
  assert.equal((home.match(/<img src="\.\/assets\/favicon\.svg"/g) || []).length, 2);
  assert.match(home, /<link rel="icon" type="image\/svg\+xml" href="\.\/assets\/favicon\.svg">/);
  assert.doesNotMatch(home, /<svg viewBox="0 0 64 64"/);

  for (const page of [detail, preview]) {
    assert.equal((page.match(/<img src="\.\.\/\.\.\/assets\/favicon\.svg"/g) || []).length, 2);
    assert.match(page, /<link rel="icon" type="image\/svg\+xml" href="\.\.\/\.\.\/assets\/favicon\.svg">/);
    assert.match(page, /<div class="container footer-inner">/);
    assert.match(page, /href="https:\/\/github\.com\/ePlus-DEV\/muse-invite-hub" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github"/);
    assert.match(page, /font-awesome\/6\.5\.2\/css\/all\.min\.css/);
    assert.doesNotMatch(page, /<svg viewBox="0 0 64 64"/);
  }
  assert.match(home, /href="\.\/" aria-label="Muse Invite Hub homepage"/);
  assert.match(detail, /href="\.\.\/\.\.\/" aria-label="Muse Invite Hub homepage"/);
});

test("directory redesign preserves SEO, GA4, a single featured listing and verified-owner meaning", () => {
  const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  assert.match(home, /<title>Muse Invite Hub — Share the spark<\/title>/);
  assert.match(home, /href="https:\/\/muse.eplus.dev\/"/);
  assert.match(home, /G-N1MZ8YLNLJ/);
  assert.match(home, /id="stat-contributors"/);
  assert.match(home, /id="stat-reported"/);
  assert.match(home, /id="code-grid"/);
  assert.match(home, /id="load-more-codes"/);
  assert.doesNotMatch(home, /id="featured-invite"/);
  assert.match(app, /new Set\(codes\.map/);
  assert.match(app, /ownerConfirmed/);
  assert.match(app, /Muse redemption not independently confirmed/);
  assert.match(app, /visible\.slice\(0, displayLimit\)/);
  assert.match(renderDetailPage(owner()), /G-N1MZ8YLNLJ/);
});

test("sort dropdown uses a styled accessible menu with keyboard and outside-click dismissal", () => {
  const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../assets/styles.css", import.meta.url), "utf8");
  const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(home, /<select id="sort-codes"/);
  assert.match(home, /id="sort-trigger" aria-haspopup="menu"/);
  assert.match(home, /id="sort-menu" role="menu"/);
  assert.equal((home.match(/role="menuitemradio"/g) || []).length, 4);
  assert.match(home, /data-sort="newest" aria-checked="true"/);
  assert.match(css, /\.sort-menu\{position:absolute/);
  assert.match(css, /\.sort-option\[aria-checked="true"\]/);
  assert.match(app, /sortValue = option\.dataset\.sort/);
  assert.match(app, /sortMenu\.addEventListener\("keydown"/);
  assert.match(app, /document\.addEventListener\("pointerdown"/);
  assert.match(app, /render\(true\)/);
});

test("Threads codes retain attribution and are included in the production sitemap", () => {
  const entry = { id:"threads-sample", code:"XZ4PV6", status:"unverified",
    addedAt:"2026-11-12", sourceUrl:"https://www.threads.com/@zkeir1914" };
  const html = renderDetailPage(entry);
  assert.match(html, /Threads · @zkeir1914/);
  assert.match(html, /https:\/\/www\.threads\.com\/@zkeir1914/);
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(generateSitemap([owner(), entry]), /codes\/XZ4PV6/);
  const home = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  assert.equal((home.match(/class="source-filter(?: is-active)?"/g) || []).length, 5);
  assert.match(home, /data-source="x"/);
  assert.match(home, /data-source="facebook"/);
  assert.match(home, /data-source="threads"/);
  assert.match(app, /sourceInfo\(item\)\.handle/);
  assert.match(app, /sourceFilter === "all"/);
  assert.match(app, /render\(true\)/);
});

test("Give feedback prefills editable issue title and code; platform remains a dropdown", () => {
  const homeJs = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  const detailJs = readFileSync(new URL("../assets/detail.js", import.meta.url), "utf8");
  const form = readFileSync(new URL("../.github/ISSUE_TEMPLATE/report-code.yml", import.meta.url), "utf8");
  assert.match(form, /id: invite_code/);
  assert.match(form, /- type: dropdown\n    id: listing_platform\n/);
  assert.match(form, /      options:\n        - GitHub\n        - Threads/);
  assert.doesNotMatch(form, /- type: input\n    id: listing_platform\n/);
  assert.match(form, /title: "\[Code feedback\] "/);
  assert.match(homeJs, /params\.set\("invite_code", code\)/);
  assert.match(homeJs, /params\.set\("title", "\[Code feedback\] " \+ code\)/);
  assert.doesNotMatch(homeJs, /params\.set\("listing_platform", platform\)/);
  assert.match(homeJs, /issueUrl\("report-code\.yml", item\.code\)/);
  assert.match(detailJs, /href\.searchParams\.delete\("listing_platform"\)/);
  assert.match(detailJs, /href\.searchParams\.set\("title", "\[Code feedback\] " \+ inviteCode\)/);
  for (const entry of [
    owner(),
    { ...community(), code:"XZ4PV6", submittedBy:undefined,
      sourceUrl:"https://www.threads.com/@zkeir1914" }
  ]) {
    const html = renderDetailPage(entry);
    const href = html.match(/<a href="([^"]+)" target="_blank" rel="noopener noreferrer"><i class="fa-regular fa-comment"/);
    assert.ok(href, "detail feedback link must be present");
    const url = new URL(href[1].replaceAll("&amp;", "&"));
    assert.equal(url.origin, "https://github.com");
    assert.equal(url.pathname, "/ePlus-DEV/muse-invite-hub/issues/new");
    assert.equal(url.searchParams.get("template"), "report-code.yml");
    assert.equal(url.searchParams.get("invite_code"), entry.code);
    assert.equal(url.searchParams.has("listing_platform"), false);
    assert.equal(url.searchParams.get("title"), "[Code feedback] " + entry.code);
    assert.equal(url.searchParams.getAll("title").length, 1);
    assert.equal(url.searchParams.getAll("listing_platform").length, 0);
  }
});

test("X and Facebook social codes use correct links and appear in production sitemap", () => {
  for (const [code, url, label] of [
    ["X12345", "https://x.com/muse_helper/status/1234567890123456789", "X (Twitter) · @muse_helper"],
    ["FB1234", "https://www.facebook.com/muse.helper/posts/pfbid0123456789", "Facebook · @muse.helper"]
  ]) {
    const entry = {id:"test-"+code.toLowerCase(),code,status:"unverified",addedAt:"2026-11-12",sourceUrl:url};
    const html = renderDetailPage(entry);
    assert.ok(html.includes(label), "wrong source attribution: " + code);
    assert.ok(html.includes(url), "missing source permalink: " + code);
    assert.match(html, /name="robots" content="index,follow"/);
    assert.match(generateSitemap([owner(),entry]), new RegExp("/codes/" + code + "/"));
  }
  const app = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
  assert.match(app, /"X \(Twitter\)","x","fa-brands fa-x-twitter"/);
  assert.match(app, /"Facebook","facebook","fa-brands fa-facebook-f"/);
  assert.match(app, /sourceInfo\(item\)\.key === sourceFilter/);
});
