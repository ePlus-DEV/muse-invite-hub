import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderPageSkeleton } from "./page-skeleton.mjs";
import { renderDetailPage } from "./site-pages.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const home = read("index.html");
const css = read("assets/styles.css");
const app = read("assets/app.js");
const detail = renderDetailPage({
  id: "example", code: "TEST42", submittedBy: "contributor",
  addedAt: "2026-11-11", status: "unverified"
});

test("home skeleton is immediately present in static HTML, matching the shared renderer", () => {
  const skeleton = renderPageSkeleton("home");
  assert.ok(home.includes(skeleton), "Homepage skeleton should not wait for app.js to fetch data");
  assert.equal((home.match(/id="page-skeleton"/g) || []).length, 1);
  for (const section of ["skel-site-header", "skel-hero", "skel-mascot", "skel-stats",
    "skel-toolbar", "skel-market", "skel-filters", "skel-grid", "skel-help",
    "skel-site-footer"]) {
    assert.ok(skeleton.includes(section), "Missing homepage skeleton section " + section);
  }
  assert.equal((skeleton.match(/class="skel-card"/g) || []).length, 12);
  assert.match(skeleton, /hidden role="status" aria-label="Loading Muse Invite Hub page"/);
  assert.match(skeleton, /aria-hidden="true"/);
});

test("detail skeleton covers the code layout without changing rendered SEO or content", () => {
  const skeleton = renderPageSkeleton("detail");
  assert.ok(detail.includes(skeleton), "Generated details should include an initial skeleton");
  for (const part of ["skel-site-header", "skel-breadcrumb", "skel-detail-grid",
    "skel-detail-code", "skel-instructions", "skel-detail-sidebar", "skel-site-footer"]) {
    assert.ok(skeleton.includes(part), "Missing detail skeleton part " + part);
  }
  assert.match(detail, /<h1 id="detail-title">Invite code/);
  assert.match(detail, /<meta name="robots" content="index,follow">/);
  assert.match(detail, /rel="canonical" href="https:\/\/muse.eplus.dev\/codes\/TEST42\/"/);
  assert.match(detail, /DOMContentLoaded/);
  assert.doesNotMatch(skeleton, /<a |<button |<input /);
  assert.throws(() => renderPageSkeleton("unknown"), /Invalid skeleton/);
});

test("progressive enhancement never hides content when scripts are disabled or errors occur", () => {
  assert.match(home, /document\.documentElement\.classList\.add\("is-page-loading"\)/);
  assert.match(home, /window\.setTimeout\(\(\) => document\.documentElement\.classList\.remove\("is-page-loading"\), 9000\)/);
  assert.match(app, /const controller = new AbortController\(\)/);
  assert.match(app, /window\.setTimeout\(\(\) => controller\.abort\(\), 7500\)/);
  assert.match(app, /window\.clearTimeout\(requestTimeout\)/);
  assert.match(app, /document\.documentElement\.classList\.remove\("is-page-loading"\)/);
  assert.match(css, /#page-skeleton\[hidden\]\{display:none!important\}/);
  assert.match(css, /html\.is-page-loading #page-skeleton\[hidden\]\{display:block!important\}/);
  assert.match(css, /html\.is-page-loading body>main/);
});

test("skeleton follows responsive layout and reduced-motion accessibility", () => {
  assert.match(css, /\.skel-grid\{display:grid;grid-template-columns:repeat\(4,/);
  assert.match(css, /max-width:1080px/);
  assert.match(css, /max-width:800px/);
  assert.match(css, /max-width:620px/);
  assert.match(css, /\.skel-grid\{grid-template-columns:1fr/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.skel-shimmer\{animation:none!important/);
  assert.match(css, /@keyframes skel-shimmer/);
});
