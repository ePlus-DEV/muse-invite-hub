import { existsSync, mkdirSync, readdirSync, lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildPreview, isSafeSiteFile } from "./preview-core.mjs";

const number = Number(process.env.PR_NUMBER);
const sha = process.env.PR_HEAD_SHA || process.env.GITHUB_SHA;
if (!Number.isSafeInteger(number) || number <= 0) throw Error("Missing PR_NUMBER");
if (!/^[0-9a-f]{40}$/.test(sha || "")) throw Error("Missing PR_HEAD_SHA");
const paths = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name).replace(/\\/g, "/");
    const st = lstatSync(path);
    if (st.isSymbolicLink()) throw Error("Symlinks not allowed: " + path);
    if (st.isDirectory()) walk(path);
    else if (st.isFile() && isSafeSiteFile(path)) paths.push(path);
  }
}
for (const dir of ["assets", "data"]) if (existsSync(dir)) walk(dir);
paths.push("index.html");
const dest = resolve("_offline-preview");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
buildPreview({ files: paths, readFile: readFileSync, dest,
  number, sha, origin: "https://muse.eplus.dev", hosted: false });
writeFileSync(join(dest, "PREVIEW_README.txt"),
  "Muse Invite Hub PR #" + number + " offline preview\n" +
  "Run a local HTTP server inside this folder (for example: python -m http.server 8000)\n" +
  "and visit http://localhost:8000/ . The invite catalog requires HTTP, not file://.\n" +
  "All code data comes from the PR being validated. This is not a public live preview.\n");
console.log("Built downloadable PR #" + number + " preview at _offline-preview/");
