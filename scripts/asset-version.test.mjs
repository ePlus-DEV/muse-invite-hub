import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stampAssetUrls, stampSiteAssets } from "./asset-version.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "muse-asset-version-"));
  mkdirSync(join(root, "assets"));
  mkdirSync(join(root, "codes", "DPNIHH"), {recursive:true});
  const contents = {
    "styles.css":"body { color: red }",
    "detail.js":"console.log('version one')",
    "app.js":"console.log('home')",
    "social-preview.png":"test image bytes"
  };
  for (const [file,bytes] of Object.entries(contents)) {
    writeFileSync(join(root,"assets",file),bytes);
  }
  return {root,contents,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
const digest = bytes => createHash("sha256").update(bytes).digest("hex").slice(0,12);

test("assets use stable content hashes instead of PR names or build dates", () => {
  const f = fixture();
  try {
    const html = '<link href="../../assets/styles.css"><script src="../../assets/detail.js"></script>';
    const first=stampAssetUrls(html,f.root);
    assert.match(first,new RegExp('styles\\.css\\?v='+digest(f.contents["styles.css"])));
    assert.match(first,new RegExp('detail\\.js\\?v='+digest(f.contents["detail.js"])));
    assert.doesNotMatch(first,/pr[0-9]+-reports|20261117/);
    assert.equal(stampAssetUrls(first,f.root),first,"Repeated stamping must be idempotent");
    writeFileSync(join(f.root,"assets","styles.css"),"body { color: blue }");
    const second=stampAssetUrls(html,f.root);
    assert.match(second,new RegExp('styles\\.css\\?v='+digest("body { color: blue }")));
    assert.match(second,new RegExp('detail\\.js\\?v='+digest(f.contents["detail.js"])));
    assert.notEqual(second,first,"Changed asset bytes must change only their own version");
  } finally { f.cleanup(); }
});

test("production and PR previews are stamped with their own local assets", () => {
  const f=fixture();
  try {
    const detail=join(f.root,"codes","DPNIHH","index.html");
    const home=join(f.root,"index.html");
    writeFileSync(home,'<link href="./assets/styles.css"><script src="./assets/app.js"></script>'+
      '<meta property="og:image" content="https://muse.eplus.dev/assets/social-preview.png">');
    writeFileSync(detail,'<link href="../../assets/styles.css"><script src="../../assets/detail.js"></script>');
    assert.equal(stampSiteAssets(f.root),2);
    const built=readFileSync(home,"utf8");
    assert.match(built,new RegExp('styles\\.css\\?v='+digest(f.contents["styles.css"])));
    assert.match(built,new RegExp('app\\.js\\?v='+digest(f.contents["app.js"])));
    assert.match(built,new RegExp('social-preview\\.png\\?v='+digest(f.contents["social-preview.png"])));
    assert.equal(stampSiteAssets(f.root),0,"Second build pass must not mutate existing versions");

    const preview=join(f.root,"pr-preview","pr-72");
    mkdirSync(join(preview,"assets"),{recursive:true});
    writeFileSync(join(preview,"assets","styles.css"),"new branch styles");
    const previewHtml='<link href="./assets/styles.css">'+
      '<meta property="og:image" content="https://muse.eplus.dev/pr-preview/pr-72/assets/social-preview.png">'+
      '<meta property="og:image:secure_url" content="https://muse.eplus.dev/assets/social-preview.png">';
    writeFileSync(join(preview,"index.html"),previewHtml);
    writeFileSync(join(preview,"assets","social-preview.png"),"preview OG");
    assert.equal(stampSiteAssets(preview),1);
    assert.match(readFileSync(join(preview,"index.html"),"utf8"),
      new RegExp('styles\\.css\\?v='+digest("new branch styles")));
    assert.match(readFileSync(join(preview,"index.html"),"utf8"),
      new RegExp('social-preview\\.png\\?v='+digest("preview OG")));
    assert.notEqual(digest("new branch styles"),digest(f.contents["styles.css"]));
    assert.match(readFileSync(join(preview,"index.html"),"utf8"),
      /content="https:\/\/muse\.eplus\.dev\/assets\/social-preview\.png"/);
  } finally { f.cleanup(); }
});

test("unknown external assets are left untouched; missing local CSS fails closed", () => {
  const f=fixture();
  try {
    const html='<script src="https://cdn.example.com/library.js"></script>'+
      '<link href="./assets/styles.css"><link href="./assets/does-not-exist.css">';
    assert.throws(()=>stampAssetUrls(html,f.root),/Missing versioned asset/);
    assert.equal(stampAssetUrls('<script src="https://cdn.example.com/library.js"></script>',f.root),
      '<script src="https://cdn.example.com/library.js"></script>');
  } finally { f.cleanup(); }
});
