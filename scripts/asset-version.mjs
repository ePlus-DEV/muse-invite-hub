import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Stamp only self-hosted, cacheable CSS/JS and the social preview image.
// The value depends on the actual asset bytes, never a PR number or date.
const LOCAL_ASSET = /^(?:(?:\.\.\/)*|\.\/|https:\/\/muse\.eplus\.dev\/(?:pr-preview\/pr-[0-9]+\/)?)assets\/([a-zA-Z0-9_/-]+\.(?:css|js)|social-preview\.png)(?:\?v=[a-zA-Z0-9_.-]+)?$/;

export function stampAssetUrls(html, siteRoot, cache = new Map()) {
  return html.replace(/((?:href|src|content)=")([^"]+)(")/g, (full, start, url, end) => {
    // A preview can link to the production OG image; never attach the preview's
    // hash to an asset that is actually served by the production site.
    if (/\/pr-preview\/pr-[0-9]+$/.test(siteRoot) &&
        url.startsWith("https://muse.eplus.dev/assets/")) return full;
    const matched = LOCAL_ASSET.exec(url);
    if (!matched) return full;
    const file = matched[1];
    let version = cache.get(file);
    if (!version) {
      const fullPath = join(siteRoot, "assets", file);
      if (!existsSync(fullPath)) throw Error("Missing versioned asset: assets/" + file);
      version = createHash("sha256").update(readFileSync(fullPath)).digest("hex").slice(0, 12);
      cache.set(file, version);
    }
    const cleanUrl = url.replace(/\?v=[a-zA-Z0-9_.-]+$/, "");
    return start + cleanUrl + "?v=" + version + end;
  });
}

export function stampSiteAssets(root) {
  const cache = new Map();
  let updated = 0;
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error("Symlink in site output: " + entry.name);
      if (entry.name === "pr-preview" && dir === root) continue;
      const file = join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith(".html")) {
        const original = readFileSync(file, "utf8");
        const stamped = stampAssetUrls(original, root, cache);
        if (stamped !== original) {
          writeFileSync(file, stamped);
          updated++;
        }
      }
    }
  }
  visit(root);
  return updated;
}
