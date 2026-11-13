import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPreview, isSafeSiteFile } from "./preview-core.mjs";
import { generateSitemap, renderDetailPage } from "./site-pages.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const home = read("index.html");
const page = read("countries/index.html");
const js = read("assets/countries.js");
const css = read("assets/countries.css");
const expected = ["US", "CA", "JP", "SG", "MX"];

test("map page and homepage retain the same five documented launch markets", () => {
  const homeCodes = [...home.matchAll(/<li data-country="([A-Z]{2})">/g)].map(x => x[1]);
  const pageCodes = [...page.matchAll(/<article class="country-card[^"]*" data-code="([A-Z]{2})"/g)].map(x => x[1]);
  assert.deepEqual(homeCodes, expected);
  assert.deepEqual(pageCodes, expected);
  const sources = [...home.matchAll(/href="(https:\/\/about\.fb\.com\/[^"]+)"/g)].map(x => x[1]);
  assert.equal(sources.length, expected.length);
  for (const url of sources) assert.equal(page.split('href="' + url + '"').length - 1, 1);
  for (const code of expected) {
    const flag = code.toLowerCase();
    assert.ok(page.includes('../assets/flags/' + flag + '.svg'));
    assert.ok(page.includes('data-select="' + code + '"'));
  }
  for (const date of ["2026-09-08", "2026-09-29", "2026-10-23", "2026-10-27", "2026-11-05"]) {
    assert.ok(home.includes('datetime="' + date + '"'));
    assert.ok(page.includes('datetime="' + date + '"'));
  }
  assert.ok(page.includes('datetime="2026-11-14"'));
  assert.match(page, /Countries without a confirmed announcement are not necessarily blocked/);
  assert.match(page, /Availability ≠ eligibility/);
  assert.ok(!/guaranteed access|live availability|globally available/i.test(page));
});

test("press-reported UK is clearly separate from officially confirmed rollout", () => {
  const source = "https://www.thetimes.com/business/technology/article/mark-zuckerbergs-muse-ai-assistant-uk-launch-c5srqnkb8";
  assert.match(home, /5 confirmed · 1 press-reported · Updated 14 Nov 2026/);
  assert.match(home, /availability-expected-label/);
  assert.match(home, /No official launch date or availability/);
  assert.ok(home.includes(source));
  const detail = renderDetailPage({ id:"uk-preview", code:"DPNIHH", status:"unverified", addedAt:"2026-11-11", submittedBy:"hoangsvit" });
  assert.match(detail, /availability-expected-label/);
  assert.ok(detail.includes(source));
  assert.match(page, /<section class="countries-expected" id="expected-markets"/);
  assert.match(page, /class="country-card expected-card" data-code="GB"/);
  assert.match(page, /Expected \/ press-reported · No official launch date/);
  assert.ok(page.includes(source));
  assert.ok(page.includes('datetime="2026-11-09"'));
  assert.equal((page.match(/data-code="GB"/g)||[]).length,1);
  assert.equal((home.match(/<li data-country="[A-Z]{2}">/g)||[]).length,5);
  assert.equal((page.match(/class="country-card(?: is-selected)?"/g)||[]).length,5);
  assert.match(page, /1 press-reported market/);
  assert.match(page, /excluded from the <strong>5 confirmed markets<\/strong> total/);
  assert.match(page, /map-legend-expected/);
  assert.match(page, /data-region="europe"/);
  assert.match(js, /const confirmedMarkets = new Map/);
  assert.match(js, /const expectedMarkets = new Map/);
  assert.match(js, /map-land-expected/);
  assert.match(js, /map-marker-expected/);
  assert.match(js, /code === "GB" \? "europe"/);
  assert.match(css, /\.map-land-expected\{/);
  assert.match(css, /\.map-marker-expected /);
  assert.match(css, /\.expected-card\{/);
  assert.match(read("assets/styles.css"), /\.availability-expected\{/);
  assert.ok(!page.includes('Meta-confirmed · <time datetime="2026-11-09"'));
});

test("accessible map uses bundled Natural Earth geometry and handles absent geometry", () => {
  const geo = JSON.parse(read("data/world-countries.json"));
  assert.equal(geo.type, "FeatureCollection");
  assert.ok(geo.features.length >= 170);
  assert.match(geo.attribution, /Natural Earth public domain/);
  for (const code of ["US", "CA", "JP", "MX", "GB"]) {
    assert.ok(geo.features.some(f => f.code === code && f.geometry), code);
  }
  assert.match(js, /document\.createElementNS/);
  assert.match(js, /response\.ok/);
  assert.match(js, /buildMarkers\(\)/);
  assert.match(js, /setSelected/);
  assert.match(js, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(page, /id="map-loading" class="map-loading" role="status"/);
  assert.match(page, /id="availability-map"[^>]+role="group"/);
  assert.match(page, /data-region="world"[^>]+aria-pressed="true"/);
  assert.match(page, /<a class="skip-link" href="#markets">/);
  assert.match(page, /<link rel="canonical" href="https:\/\/muse\.eplus\.dev\/countries\/"/);
  assert.match(page, /src="\.\.\/assets\/countries\.js"/);
  assert.match(page, /href="\.\.\/assets\/countries\.css"/);
});

test("all three page types navigate to map and sitemap contains it exactly once", () => {
  assert.match(home, /href="\.\/countries\/"/);
  assert.match(page, /href="\.\.\/" aria-label="Muse Invite Hub homepage"/);
  const detail = renderDetailPage({
    id: "featured", code: "DPNIHH", status: "unverified",
    submittedBy: "hoangsvit", addedAt: "2026-11-11"
  });
  assert.match(detail, /href="\.\.\/\.\.\/countries\/"/);
  const urls = [...generateSitemap([{code:"DPNIHH"}]).matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => x[1]);
  assert.deepEqual(urls, [
    "https://muse.eplus.dev/",
    "https://muse.eplus.dev/countries/",
    "https://muse.eplus.dev/codes/DPNIHH/"
  ]);
});

test("trusted preview supports deep country route with noindex and nested relative assets", () => {
  assert.equal(isSafeSiteFile("countries/index.html"), true);
  assert.equal(isSafeSiteFile("countries/../index.html"), false);
  assert.equal(isSafeSiteFile("countries/malicious.html"), false);
  const dir = mkdtempSync(join(tmpdir(), "muse-country-preview-"));
  const source = new Map([
    ["index.html", Buffer.from(home)],
    ["countries/index.html", Buffer.from(page)],
    ["assets/app.js", Buffer.from("console.log('preview')")],
    ["assets/countries.js", Buffer.from(js)],
    ["assets/countries.css", Buffer.from(css)],
    ["assets/styles.css", Buffer.from(read("assets/styles.css"))],
    ["data/world-countries.json", Buffer.from(read("data/world-countries.json"))],
    ["data/invites.json", Buffer.from("[]")]
  ]);
  try {
    buildPreview({
      files: [...source.keys()], readFile: path => source.get(path),
      dest: dir, number: 123, sha: "a".repeat(40),
      origin: "https://muse.eplus.dev"
    });
    const nested = readFileSync(join(dir, "countries/index.html"), "utf8");
    assert.match(nested, /name="robots" content="noindex,nofollow,noarchive"/);
    assert.match(nested, /<base href="\/pr-preview\/pr-123\/countries\/">/);
    assert.match(nested, /og:url" content="https:\/\/muse\.eplus\.dev\/pr-preview\/pr-123\/countries\/"/);
    assert.doesNotMatch(nested, /rel="canonical"/);
    for (const file of ["countries/index.html","assets/countries.js","assets/countries.css","data/world-countries.json"]) {
      assert.ok(readFileSync(join(dir,file)).length > 0, file);
    }
  } finally { rmSync(dir, { recursive:true, force:true }); }
});
