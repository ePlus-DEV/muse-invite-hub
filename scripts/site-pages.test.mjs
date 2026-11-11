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
  assert.equal(PAGE_SIZE, 6);
});
test("owner detail is HTML with canonical, status, structured data and dated quota", () => {
  const html = renderDetailPage(owner());
  assert.match(html, /<title>DPNIHH Muse Invite Code \| Muse Invite Hub<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/muse.eplus.dev\/codes\/DPNIHH\/"/);
  assert.match(html, /<meta name="robots" content="index,follow">/);
  assert.match(html, /Verified Owner/);
  assert.match(html, /3 \/ 30/);
  assert.match(html, /Not live/);
  assert.match(html, /"BreadcrumbList"/);
  assert.match(html, /"WebPage"/);
  assert.match(html, /href="\.\.\/\.\.\/assets\/styles.css"/);
  assert.match(html, /href="https:\/\/muse.ai\/join"/);
  assert.doesNotMatch(html, /Muse has verified this code/);
});
test("unverified community detail is noindex and isn't indexed in the sitemap", () => {
  const html = renderDetailPage(community());
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  assert.match(html, /Not reported/);
  assert.equal(canIndexDetail(community()), false);
  const sitemap = generateSitemap([owner(), community()]);
  assert.match(sitemap, /\/codes\/DPNIHH\//);
  assert.doesNotMatch(sitemap, /\/codes\/TEST42\//);
  assert.match(sitemap, /https:\/\/muse.eplus.dev\/<\/loc>/);
});
test("preview detail uses noindex and preview-scoped og:url; never indexes owner code", () => {
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
test("generateSite creates all detail pages and only the vetted canonical sitemap entry", () => {
  const dir = mkdtempSync(join(tmpdir(), "muse-static-detail-"));
  try {
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data", "invites.json"), JSON.stringify([owner(), community()]));
    const result = generateSite(dir);
    assert.deepEqual(result, { created: 2, indexed: 1 });
    assert.match(readFileSync(join(dir, "codes", "DPNIHH", "index.html"), "utf8"), /Verified Owner/);
    assert.match(readFileSync(join(dir, "codes", "TEST42", "index.html"), "utf8"), /noindex,follow/);
    const map = readFileSync(join(dir, "sitemap.xml"), "utf8");
    assert.match(map, /DPNIHH/);
    assert.doesNotMatch(map, /TEST42/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
