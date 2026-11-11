import { readFileSync } from "node:fs";

const TOKEN = process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const ORIGIN = "https://muse.eplus.dev";
const MARKER = "<!-- muse-invite-hub-pr-preview -->";
if (REPO !== "ePlus-DEV/muse-invite-hub" || !TOKEN) throw Error("Trusted GitHub Pages environment required");
const manifest = JSON.parse(readFileSync("_site/pr-preview/manifest.json", "utf8"));
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(path, { method = "GET", body } = {}) {
  const response = await fetch("https://api.github.com/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw Error(method + " " + path + " HTTP " + response.status);
  return response.status === 204 ? null : response.json();
}
async function botComment(number, body, allowNew = true) {
  let previous = null;
  for (let page = 1; page <= 4; page++) {
    const comments = await api("repos/" + REPO + "/issues/" + number + "/comments?per_page=100&page=" + page);
    previous = comments.find(c => c.user?.login === "github-actions[bot]" && c.body?.includes(MARKER));
    if (previous || comments.length < 100) break;
  }
  if (previous) {
    if (previous.body !== body) {
      await api("repos/" + REPO + "/issues/comments/" + previous.id, { method: "PATCH", body: { body } });
    }
  } else if (allowNew) {
    await api("repos/" + REPO + "/issues/" + number + "/comments", { method: "POST", body: { body } });
  }
}
async function verifyLive(record) {
  const root = ORIGIN + "/pr-preview/pr-" + record.number + "/";
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const suffix = "?verify=" + record.head_sha.slice(0, 12) + "-" + attempt;
      const names = ["preview-meta.json", "index.html", "assets/styles.css", "assets/app.js", "data/invites.json"];
      const results = await Promise.all(names.map(async path => {
        const response = await fetch(root + path + suffix, {
          cache: "no-store", signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw Error(path + " responded HTTP " + response.status);
        return response;
      }));
      const meta = await results[0].json();
      const html = await results[1].text();
      if (meta.head_sha !== record.head_sha || meta.pr_number !== record.number) throw Error("Stale preview metadata");
      if (!html.includes('name="robots" content="noindex,nofollow,noarchive"') ||
          !html.includes('muse-preview-head" content="' + record.head_sha + '"')) throw Error("Missing noindex or correct commit");
      const list = await results[4].json();
      if (!Array.isArray(list)) throw Error("Invalid published data file");
      return true;
    } catch (error) {
      console.log("Preview #" + record.number + " verification " + attempt + "/6: " + error.message);
      if (attempt < 6) await sleep(4000);
    }
  }
  return false;
}
for (const record of manifest.previews) {
  const current = await api("repos/" + REPO + "/pulls/" + record.number);
  if (current.state !== "open" || current.head.sha !== record.head_sha || current.base.ref !== "main") continue;
  let status;
  if (record.status === "ready") {
    const verified = await verifyLive(record);
    status = verified
      ? "**[Open live preview](" + ORIGIN + "/pr-preview/pr-" + record.number + "/)**\n\n" +
        "Published PR head: " + record.head_sha.slice(0, 12) + ". Preview pages are noindex and isolated from production."
      : "⚠️ **Preview build succeeded, but the public URL was not verified yet.** No live link is posted until index.html, JavaScript, CSS and catalog all respond correctly.";
  } else {
    status = "⏳ **Preview unavailable until this PR passes the validate check and can be merged cleanly into main.**" +
      (record.reason ? "\n\nBuild reason: " + record.reason.replace(/[\r\n]/g, " ") : "");
  }
  const message = [MARKER, "### Muse Invite Hub — PR #" + record.number + " preview", "", status, "",
    "Preview URL follows the format /pr-preview/pr-N/. Production remains sourced from main.",
    "A new PR commit invalidates the old preview; closing the PR removes its preview.", ""].join("\n");
  await botComment(record.number, message);
}
if (process.env.GITHUB_EVENT_NAME === "pull_request_target" &&
    event.action === "closed" && Number.isSafeInteger(event.pull_request?.number)) {
  const number = event.pull_request.number;
  const body = [MARKER, "### Muse Invite Hub — PR #" + number + " preview", "",
    "🗃️ **Preview expired.** The pull request is closed, and its directory is excluded from the current Pages deployment.",
    ""].join("\n");
  await botComment(number, body, false);
}
