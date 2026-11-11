import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPreview, cleanPreviewHtml, isSafeSiteFile } from "./preview-core.mjs";

const head = "a".repeat(40);
const source = new Map([
  ["index.html", Buffer.from('<!doctype html><html><head><link rel="canonical" href="https://muse.eplus.dev/"><meta property="og:url" content="https://muse.eplus.dev/"><title>Test</title></head><body><a href="#codes">Codes</a><script src="./assets/app.js"></script></body></html>')],
  ["assets/app.js", Buffer.from('console.log("preview test")')],
  ["assets/styles.css", Buffer.from('body{color:red}')],
  ["data/invites.json", Buffer.from("[]")]
]);

test("preview site uses noindex, PR origin and relative assets", () => {
  const dir = mkdtempSync(join(tmpdir(), "muse-preview-"));
  try {
    const meta = buildPreview({ files: [...source.keys()], readFile: p => source.get(p),
      dest: dir, number: 42, sha: head, origin: "https://muse.eplus.dev" });
    const html = readFileSync(join(dir, "index.html"), "utf8");
    assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
    assert.match(html, /<base href="\/pr-preview\/pr-42\/">/);
    assert.match(html, /muse-preview-head" content="aaaa/);
    assert.match(html, /og:url" content="https:\/\/muse.eplus.dev\/pr-preview\/pr-42\/"/);
    assert.doesNotMatch(html, /rel="canonical"/);
    assert.match(html, /src=".\/assets\/app.js"/);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "preview-meta.json"), "utf8")).pr_number, 42);
    assert.equal(meta.head_sha, head);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("unsafe paths, oversized payloads and broken catalogs are rejected", () => {
  assert.equal(isSafeSiteFile("../CNAME"), false);
  assert.equal(isSafeSiteFile("assets/../../foo.js"), false);
  assert.equal(isSafeSiteFile("assets/malware.sh"), false);
  const dir = mkdtempSync(join(tmpdir(), "muse-preview-"));
  try {
    const bad = new Map(source);
    bad.set("data/invites.json", Buffer.from('[{"code":"NOTVALID"}]'));
    assert.throws(() => buildPreview({ files: [...source.keys()], readFile: p => bad.get(p),
      dest: dir, number: 42, sha: head, origin: "https://muse.eplus.dev" }), /Invalid PR invite catalog/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("broken head or HTML structure cannot publish", () => {
  assert.throws(() => cleanPreviewHtml("<html></html>", { number: 7, sha: head, origin: "https://muse.eplus.dev" }), /HTML/);
  assert.throws(() => cleanPreviewHtml("<head></head><body>", { number: 7, sha: "xyz", origin: "https://muse.eplus.dev" }), /SHA/);
});

test("trusted preview renderer publishes deep code routes and noindex without executing a PR script", () => {
  const dir = mkdtempSync(join(tmpdir(), "muse-preview-deep-"));
  const owner = {
    id: "owner-invite", code: "DPNIHH", featured: true, ownerConfirmed: true,
    submittedBy: "hoangsvit", status: "unverified", addedAt: "2026-11-11",
    reportedCapacity: 30, reportedUses: 27, usageReportedAt: "2026-11-11"
  };
  const rich = new Map(source);
  rich.set("assets/detail.js", Buffer.from("document.documentElement.dataset.preview = 'yes';"));
  rich.set("assets/social-preview.png", Buffer.from("test-image"));
  rich.set("data/invites.json", Buffer.from(JSON.stringify([owner])));
  try {
    const meta = buildPreview({
      files: [...rich.keys()], readFile: p => rich.get(p), dest: dir,
      number: 17, sha: head, origin: "https://muse.eplus.dev"
    });
    assert.equal(meta.detail_pages, 1);
    const detail = readFileSync(join(dir, "codes", "DPNIHH", "index.html"), "utf8");
    assert.match(detail, /DPNIHH/);
    assert.match(detail, /3 \/ 30/);
    assert.match(detail, /noindex,nofollow,noarchive/);
    assert.match(detail, /https:\/\/muse.eplus.dev\/pr-preview\/pr-17\/codes\/DPNIHH\//);
    assert.match(detail, /href="\.\.\/\.\.\/assets\/styles.css"/);
    assert.match(detail, /src="\.\.\/\.\.\/assets\/detail.js"/);
    assert.match(detail, /https:\/\/muse.eplus.dev\/pr-preview\/pr-17\/assets\/social-preview.png/);
    assert.equal(JSON.parse(readFileSync(join(dir, "preview-meta.json"), "utf8")).detail_pages, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("legacy PR without detail script still receives the original homepage preview", () => {
  const dir = mkdtempSync(join(tmpdir(), "muse-preview-legacy-"));
  try {
    const meta = buildPreview({
      files: [...source.keys()], readFile: p => source.get(p), dest: dir,
      number: 16, sha: head, origin: "https://muse.eplus.dev"
    });
    assert.equal(meta.detail_pages, 0);
    assert.match(readFileSync(join(dir, "index.html"), "utf8"), /noindex,nofollow,noarchive/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
