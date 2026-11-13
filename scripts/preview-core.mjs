import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateCatalog } from "./validate.mjs";
import { generateSite } from "./site-pages.mjs";
import { assembleCatalog } from "./catalog.mjs";

export const PREVIEW_PREFIX = "pr-preview";
export const REQUIRED_FILES = ["index.html", "assets/app.js", "assets/styles.css", "data/invites.json"];
const ALLOWED = /^(?:countries\/index\.html|index\.html|llms\.txt|assets\/[a-zA-Z0-9_./-]+\.(?:js|css|svg|png|jpg|jpeg|webp|avif|mp4)|data\/[a-zA-Z0-9_./-]+\.json)$/;

export function isSafeSiteFile(path) {
  return typeof path === "string" && path.length < 200 && !path.includes("..") &&
    !path.includes("//") && ALLOWED.test(path);
}

export function cleanPreviewHtml(html, { number, sha, origin, hosted = true, pagePath = "" }) {
  if (pagePath !== "" && pagePath !== "countries/") throw Error("Unsafe preview page path");
  if (!Number.isSafeInteger(number) || number < 1) throw Error("Invalid PR number");
  if (!/^[0-9a-f]{40}$/.test(sha)) throw Error("Invalid PR head SHA");
  if (!html.includes("<head>") || !html.includes("</head>") || !html.includes("<body>")) {
    throw Error("Missing expected HTML document structure");
  }
  // A preview may never claim the production canonical URL or be crawled as production.
  let result = html.replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+property=["']og:url["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']robots["'][^>]*>\s*/gi, "");
  const location = origin.replace(/\/+$/, "") + "/pr-preview/pr-" + number + "/" + pagePath;
  const previewHead = [
    '<meta name="robots" content="noindex,nofollow,noarchive">',
    '<meta name="muse-preview-head" content="' + sha + '">',
    '<meta property="og:url" content="' + location + '">',
    hosted ? '<base href="/pr-preview/pr-' + number + '/' + pagePath + '">' : ""
  ].filter(Boolean).join("\n  ");
  result = result.replace("</head>", "  " + previewHead + "\n</head>");
  // No production analytics or root-relative local asset paths in preview.
  if (/<(?:script|img|link)\b[^>]*(?:src|href)=["']\/(?!\/)/i.test(result) &&
      !/<base href="\/pr-preview\//.test(result)) {
    throw Error("Preview has root-relative assets with no hosted base");
  }
  return result;
}

export function buildPreview({ files, readFile, dest, number, sha, mergeSha = null, origin, hosted = true }) {
  const paths = files.filter(isSafeSiteFile);
  for (const needed of REQUIRED_FILES) {
    if (!paths.includes(needed)) throw Error("Missing preview source: " + needed);
  }
  const dataset = assembleCatalog(paths,readFile);
  const problems = validateCatalog(dataset);
  if (problems.length) throw Error("Invalid PR invite catalog: " + problems.join("; "));
  let budget = 0;
  for (const path of paths) {
    const buffer = readFile(path);
    budget += buffer.length;
    if (buffer.length > 5 * 1024 * 1024 || budget > 16 * 1024 * 1024) {
      throw Error("Preview source exceeds allowed size");
    }
    const output = join(dest, path);
    mkdirSync(dirname(output), { recursive: true });
    if (path === "index.html" || path === "countries/index.html") {
      const html = cleanPreviewHtml(buffer.toString("utf8"), {
        number, sha, origin, hosted,
        pagePath: path === "countries/index.html" ? "countries/" : ""
      });
      writeFileSync(output, html);
    } else {
      writeFileSync(output, buffer);
    }
  }
  // Previews use the same merged catalog without executing PR-supplied scripts.
  writeFileSync(join(dest,"data/invites.json"),JSON.stringify(dataset,null,2)+"\n");
  if (paths.includes("countries/index.html")) {
    for (const file of ["assets/countries.js", "assets/countries.css", "data/world-countries.json"]) {
      if (!paths.includes(file)) throw Error("Missing country preview dependency: " + file);
    }
  }
  writeFileSync(join(dest, ".nojekyll"), "");
  // The trusted generator runs only after validated JSON + static PR assets
  // have been copied; never execute scripts from the unmerged PR branch.
  let detailPages = 0;
  if (paths.includes("assets/detail.js")) {
    const built = generateSite(dest, {
      origin, basePath: hosted ? "/pr-preview/pr-" + number + "/" : "/",
      preview: true
    });
    detailPages = built.created;
    if (detailPages !== dataset.length) throw Error("Incomplete detail preview output");
  }
  const metadata = {
    pr_number: number,
    head_sha: sha,
    merge_sha: mergeSha,
    generated_at: new Date().toISOString(),
    noindex: true,
    detail_pages: detailPages
  };
  writeFileSync(join(dest, "preview-meta.json"), JSON.stringify(metadata, null, 2) + "\n");
  return metadata;
}
