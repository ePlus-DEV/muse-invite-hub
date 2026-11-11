import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildPreview, isSafeSiteFile } from "./preview-core.mjs";
import { generateSite } from "./site-pages.mjs";

const REPO = process.env.GITHUB_REPOSITORY;
const ORIGIN = "https://muse.eplus.dev";
const TOKEN = process.env.GH_TOKEN;
const MAX_PREVIEWS = 40;
if (REPO !== "ePlus-DEV/muse-invite-hub" || !TOKEN) {
  throw Error("Build must run in the trusted Muse Invite Hub workflow with a read-only API token");
}
const output = resolve("_site");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

function copyTrusted(path) {
  const full = resolve(path);
  const st = lstatSync(full);
  if (st.isSymbolicLink()) throw Error("Production symlink not allowed: " + path);
  if (st.isDirectory()) {
    for (const name of readdirSync(full)) copyTrusted(join(path, name));
  } else if (st.isFile()) {
    const to = join(output, path);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(full, to);
  }
}
for (const file of ["index.html", ".nojekyll", "CNAME", "robots.txt", "sitemap.xml", "llms.txt", "assets", "data"]) {
  if (existsSync(file)) copyTrusted(file);
}
for (const required of ["index.html", "llms.txt", "assets/app.js", "assets/styles.css", "data/invites.json"]) {
  if (!existsSync(join(output, required))) throw Error("Production output missing " + required);
}
const code = JSON.parse(readFileSync(join(output, "data/invites.json"), "utf8"));
if (!Array.isArray(code)) throw Error("Production catalog is not an array");
const productionPages = generateSite(output);
console.log("Generated " + productionPages.created + " static invite detail pages and " + productionPages.indexed + " indexable entries.");

async function api(path) {
  const res = await fetch("https://api.github.com/" + path, {
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!res.ok) throw Error("GitHub API " + res.status + ": " + path);
  return res.json();
}
async function listOpenPRs() {
  const prs = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await api("repos/" + REPO + "/pulls?state=open&per_page=100&page=" + page);
    prs.push(...batch);
    if (batch.length < 100) break;
  }
  return prs.filter(pr => pr.base?.ref === "main" &&
    pr.head?.repo?.full_name === REPO &&
    pr.head?.ref !== "main" &&
    !(pr.draft === true && pr.head.ref.startsWith("auto/issue-")) &&
    Number.isSafeInteger(pr.number));
}
function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: process.cwd(), ...(options.binary ? {} : { encoding: "utf8" }),
    maxBuffer: 8 * 1024 * 1024, timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"]
  });
}
function mergeFiles(mergeSha) {
  const entries = git(["ls-tree", "-r", "-z", mergeSha]).split("\0").filter(Boolean);
  return entries.map(row => {
    const [head, path] = row.split("\t");
    return { mode: head?.split(" ")[0], path };
  }).filter(x => isSafeSiteFile(x.path)).map(x => {
    if (x.mode !== "100644" && x.mode !== "100755") {
      throw Error("Unsafe symlink or git mode for " + x.path);
    }
    return x.path;
  });
}
function readMergeFile(mergeSha, path) {
  // execFileSync uses an argv array: no shell or PR-supplied command execution.
  return git(["show", mergeSha + ":" + path], { binary: true });
}
const state = {
  production_head: git(["rev-parse", "HEAD"]).trim(),
  built_at: new Date().toISOString(),
  origin: ORIGIN,
  previews: []
};
for (const pr of (await listOpenPRs()).slice(0, MAX_PREVIEWS)) {
  const head = pr.head.sha;
  const record = { number: pr.number, head_sha: head, status: "pending" };
  state.previews.push(record);
  try {
    const checks = await api("repos/" + REPO + "/commits/" + head + "/check-runs?per_page=100");
    const match = checks.check_runs?.some(check =>
      check.name === "validate" && check.head_sha === head &&
      check.status === "completed" && check.conclusion === "success");
    if (!match) {
      record.status = "checks-not-passing";
      console.log("PR #" + pr.number + ": skip until validate check passes on " + head.slice(0, 7));
      continue;
    }
    // Use the GitHub-generated merge result, so the preview includes latest main.
    git(["fetch", "--no-tags", "--depth=2", "origin", "refs/pull/" + pr.number + "/merge"]);
    const mergeSha = git(["rev-parse", "FETCH_HEAD"]).trim();
    const parents = git(["show", "-s", "--format=%P", mergeSha]).trim().split(/\s+/);
    if (parents.length < 2 || parents[1] !== head) throw Error("Merge ref does not match current PR head");
    const current = await api("repos/" + REPO + "/pulls/" + pr.number);
    if (current.state !== "open" || current.base.ref !== "main" ||
      current.head.sha !== head || current.head.repo.full_name !== REPO) {
      throw Error("PR changed while assembling preview");
    }
    const files = mergeFiles(mergeSha);
    const dest = join(output, "pr-preview", "pr-" + pr.number);
    const built = buildPreview({ files, readFile: file => readMergeFile(mergeSha, file), dest,
      number: pr.number, sha: head, mergeSha, origin: ORIGIN });
    record.detail_pages = built.detail_pages;
    // Parse JavaScript but never execute scripts from the untrusted PR ref.
    const syntax = spawnSync(process.execPath, ["--check", join(dest, "assets/app.js")],
      { encoding: "utf8", timeout: 15000 });
    if (syntax.status !== 0) throw Error("PR browser script syntax failed: " + syntax.stderr);
    record.status = "ready";
    record.merge_sha = mergeSha;
    console.log("PR #" + pr.number + ": rendered " + head.slice(0, 7));
  } catch (error) {
    record.status = "unavailable";
    record.reason = String(error.message).slice(0, 180);
    rmSync(join(output, "pr-preview", "pr-" + pr.number), { recursive: true, force: true });
    console.warn("PR #" + pr.number + " preview unavailable: " + record.reason);
  }
}
mkdirSync(join(output, "pr-preview"), { recursive: true });
writeFileSync(join(output, "pr-preview", "manifest.json"), JSON.stringify(state, null, 2) + "\n");
console.log("Built production and " + state.previews.filter(x => x.status === "ready").length +
  " verified PR previews (" + state.previews.length + " eligible open PRs).");
