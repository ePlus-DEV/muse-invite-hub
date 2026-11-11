import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDetailPage, generateSitemap } from "./site-pages.mjs";
import { buildPreview, isSafeSiteFile } from "./preview-core.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const origin = "https://muse.eplus.dev";

test("homepage metadata and WebSite structured data remain intact", () => {
  const html = read("index.html");
  assert.match(html, /<title>Muse Invite Hub — Share the spark<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/muse\.eplus\.dev\/"/);
  assert.match(html, /G-N1MZ8YLNLJ/);
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match);
  const data = JSON.parse(match[1]);
  assert.equal(data["@type"], "WebSite");
  assert.equal(data.url, origin + "/");
  assert.equal(data.name, "Muse Invite Hub");
});

test("Q&A provides factual answers in HTML without unsupported rich-result claims", () => {
  const html = read("index.html");
  for (const question of ["What is Muse Invite Hub?", "Does a listed invite code guarantee Muse access?", "How can I share or report a code?"]) {
    assert.ok(html.includes(question));
  }
  assert.match(html, /Only Muse can confirm whether a code can be redeemed/);
  assert.match(html, /Maintainers review submissions before publication/);
  assert.doesNotMatch(html, /FAQPage|AggregateRating|guaranteed free tokens/i);
});

test("llms.txt contains only trustworthy indexable code-page links", () => {
  const llms = read("llms.txt");
  assert.match(llms, /^# Muse Invite Hub\n/);
  assert.match(llms, /not a live code-validity feed/);
  assert.ok(llms.includes(origin + "/"));
  assert.ok(llms.includes(origin + "/sitemap.xml"));
  assert.ok(llms.includes("https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml"));
  const catalog = JSON.parse(read("data/invites.json"));
  const owner = catalog.find(entry => entry.featured === true && entry.ownerConfirmed === true);
  assert.ok(owner);
  assert.ok(llms.includes(origin + "/codes/" + owner.code + "/"));
  for (const item of catalog.filter(entry => !entry.ownerConfirmed)) {
    assert.ok(!llms.includes(origin + "/codes/" + item.code + "/"));
  }
});

test("robots, detail noindex and sitemap retain the intended policy", () => {
  const robots = read("robots.txt");
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Sitemap: https:\/\/muse\.eplus\.dev\/sitemap\.xml/);
  const catalog = JSON.parse(read("data/invites.json"));
  const sitemap = generateSitemap(catalog);
  assert.ok(sitemap.includes("<loc>" + origin + "/</loc>"));
  for (const item of catalog) {
    const page = renderDetailPage(item);
    if (item.featured && item.ownerConfirmed) {
      assert.match(page, /<meta name="robots" content="index,follow">/);
      assert.ok(sitemap.includes("/codes/" + item.code + "/"));
    } else {
      assert.match(page, /<meta name="robots" content="noindex,follow">/);
      assert.ok(!sitemap.includes("/codes/" + item.code + "/"));
    }
  }
  assert.match(renderDetailPage(catalog[0], { preview:true, basePath:"/pr-preview/pr-21/" }), /noindex,nofollow,noarchive/);
});

test("public and preview build allow the llms.txt file safely", () => {
  assert.equal(isSafeSiteFile("llms.txt"), true);
  assert.equal(isSafeSiteFile("llms-full.txt"), false);
  assert.equal(isSafeSiteFile("../llms.txt"), false);
  assert.match(read("scripts/build-pages.mjs"), /"llms.txt"/);
  assert.match(read(".github/workflows/pages.yml"), /test -s _site\/llms.txt/);
  const map = new Map([
    ["index.html", Buffer.from('<!doctype html><html><head><title>Preview</title></head><body>OK</body></html>')],
    ["assets/app.js", Buffer.from('console.log("hello")')],
    ["assets/styles.css", Buffer.from('body{}')],
    ["data/invites.json", Buffer.from("[]")],
    ["llms.txt", Buffer.from(read("llms.txt"))]
  ]);
  const dir = mkdtempSync(join(tmpdir(), "muse-llms-preview-"));
  try {
    buildPreview({ files:[...map.keys()], readFile:p=>map.get(p),dest:dir,number:71,sha:"a".repeat(40),origin });
    assert.equal(readFileSync(join(dir,"llms.txt"),"utf8"),read("llms.txt"));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
