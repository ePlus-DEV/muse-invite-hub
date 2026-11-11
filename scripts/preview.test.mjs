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
