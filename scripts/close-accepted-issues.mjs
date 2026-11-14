import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readIssueFields } from "./issue-to-pr.mjs";
import { readCatalog, recordPath } from "./catalog.mjs";

const REPO = "ePlus-DEV/muse-invite-hub";
const ORIGIN = "https://muse.eplus.dev";
const MARKER = "<!-- muse-accepted-contribution -->";
const SHA = /^[a-f0-9]{40}$/;
const CODE = /^[A-Z0-9-]{4,32}$/;

export function acceptedCandidate(pr) {
  const match = /^auto\/issue-([1-9][0-9]*)-(invite|count|feedback)$/.exec(pr?.head?.ref || "");
  if (!match || !pr.merged_at || !SHA.test(pr.merge_commit_sha || "") ||
      pr.head?.repo?.full_name !== REPO || pr.base?.ref !== "main" ||
      pr.user?.login !== "github-actions[bot]") return null;
  const issueNumber = Number(match[1]), kind = match[2];
  if (!Number.isSafeInteger(issueNumber)) return null;
  const code = /\bCode: \*\*([A-Z0-9-]{4,32})\*\*\. Change:/.exec(pr.body || "")?.[1];
  if (!code || !CODE.test(code) ||
      pr.title !== "data: review " + code + " " + kind + " (issue #" + issueNumber + ")" ||
      !(pr.body || "").includes("Prepared from public Issue #" + issueNumber + " by @")) return null;
  return { issueNumber, kind, code, prNumber:pr.number, mergeSha:pr.merge_commit_sha };
}

export function acceptanceComment({ code, prNumber }) {
  const detail = ORIGIN + "/codes/" + code + "/";
  return [
    MARKER,
    "✅ **Your contribution has been accepted and published on Muse Invite Hub.**",
    "",
    "**Invite code:** " + code,
    "**Published detail:** [View " + code + "](" + detail + ")",
    "**Reviewed PR:** #" + prNumber,
    "",
    "This confirms your contribution was added to our public directory (or its report was updated). " +
      "It does **not** mean Muse has verified redemption, eligibility, or remaining slots.",
    "",
    "We are closing this Issue now. Thank you for contributing!"
  ].join("\n");
}

function githubApi(request, token) {
  return async (method, path, body) => {
    const response = await request("https://api.github.com/repos/" + REPO + "/" + path, {
      method,
      headers:{
        "Accept":"application/vnd.github+json",
        "Authorization":"Bearer " + token,
        "X-GitHub-Api-Version":"2022-11-28",
        ...(body === undefined ? {} : {"Content-Type":"application/json"})
      },
      ...(body === undefined ? {} : {body:JSON.stringify(body)}),
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw Error("GitHub API " + method + " " + path + ": HTTP " + response.status);
    return response.status === 204 ? null : response.json();
  };
}

async function issueCommentFlags(api, issueNumber) {
  let accepted = false, feedbackReopened = false;
  for (let page = 1; page <= 10; page++) {
    const comments = await api("GET", "issues/" + issueNumber + "/comments?per_page=100&page=" + page);
    for (const entry of comments) {
      if (entry.user?.login !== "github-actions[bot]") continue;
      if (entry.body?.includes(MARKER)) accepted = true;
      if (entry.body?.includes("<!-- muse-code-feedback-reopened -->")) feedbackReopened = true;
    }
    if (comments.length < 100) return { accepted, feedbackReopened };
  }
  throw Error("Too many comments to confirm idempotency on Issue #" + issueNumber);
}

async function liveDetailReady(request, code) {
  const url = ORIGIN + "/codes/" + code + "/";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await request(url + "?accepted-check=" + attempt, {
        cache:"no-store", signal:AbortSignal.timeout(12000)
      });
      if (response.ok) {
        const html = await response.text();
        if (html.includes("<title>" + code + " Muse Invite Code | Muse Invite Hub</title>") &&
            html.includes('rel="canonical" href="' + url + '"') &&
            !html.includes('name="robots" content="noindex')) return true;
      }
    } catch { /* Retry public pages only; a missing page is never considered live. */ }
  }
  return false;
}

export async function closeAcceptedIssues({
  token, deployedSha, repository=REPO, request=fetch, catalog
} = {}) {
  if (repository !== REPO || !token || !SHA.test(deployedSha || "")) {
    throw Error("Expected trusted repo, GitHub token and exact deployed main SHA.");
  }
  const records = catalog ?? readCatalog();
  if (!Array.isArray(records)) throw Error("Trusted production catalog is not an array.");
  const published = new Set(records.map(item => item.code));
  const api = githubApi(request, token);
  const summary = { notified:0, closed:0, pending:0, skipped:0 };
  const seen = new Set();
  // Reconcile missed notifications on future successful deployments. Never rely
  // on an Issue auto-close keyword or unmerged review-only PR contents.
  for (let page = 1; page <= 5; page++) {
    const prs = await api("GET", "pulls?state=closed&sort=updated&direction=desc&per_page=100&page=" + page);
    for (const pr of prs) {
      const candidate = acceptedCandidate(pr);
      if (!candidate || seen.has(candidate.issueNumber)) continue;
      seen.add(candidate.issueNumber);
      const {issueNumber,kind,code,prNumber,mergeSha} = candidate;
      const issue = await api("GET","issues/" + issueNumber);
      if (issue.state !== "open" || issue.pull_request) { summary.skipped++; continue; }
      const expectedTitle = {
        invite:"[Invite]",count:"[Count update]",feedback:"[Code feedback]"
      }[kind];
      if (!issue.title?.startsWith(expectedTitle) ||
          readIssueFields(issue.body)["Invite code"]?.trim().toUpperCase() !== code ||
          !published.has(code)) { summary.pending++; continue; }
      const files = await api("GET","pulls/" + prNumber + "/files?per_page=100");
      const record = records.find(item => item.code === code);
      // Standard bot PRs change one record. PR #95 also carries the
      // one-time concurrency migration; verify its individual record on deploy.
      const recordFile = record?.id ? recordPath(record) : null;
      const ordinary = files.length === 1 &&
        ["data/invites.json",recordFile].includes(files[0].filename);
      const migration = prNumber === 95 && recordFile &&
        files.some(file => file.filename === recordFile);
      if (!record || !(ordinary || migration)) {
        summary.pending++; continue;
      }
      // The deployed main commit must contain the PR merge, even for quota or
      // feedback updates where the code's detail page existed before this PR.
      const comparison = await api("GET","compare/" + mergeSha + "..." + deployedSha);
      if (!["identical","ahead"].includes(comparison.status)) { summary.pending++; continue; }
      if (!await liveDetailReady(request, code)) { summary.pending++; continue; }

      // Order matters: post the accepted detail link, THEN close the Issue.
      const flags = await issueCommentFlags(api,issueNumber);
      // Once a user has reported on a closed canonical Issue, do not let the
      // historical acceptance PR close it again on every production deploy.
      if (flags.feedbackReopened) { summary.skipped++; continue; }
      if (!flags.accepted) {
        await api("POST","issues/" + issueNumber + "/comments",
          {body:acceptanceComment({code,prNumber})});
        summary.notified++;
      }
      await api("PATCH","issues/" + issueNumber,{state:"closed",state_reason:"completed"});
      summary.closed++;
      console.log("Accepted Issue #" + issueNumber + " published at " + ORIGIN + "/codes/" + code + "/");
    }
    if (prs.length < 100) break;
  }
  console.log("Accepted contribution Issues: " + JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await closeAcceptedIssues({
      token:process.env.GH_TOKEN,
      deployedSha:process.env.DEPLOYED_SHA,
      repository:process.env.GITHUB_REPOSITORY
    });
  } catch (error) {
    console.error("::error::Could not notify/close accepted contributions: " + error.message);
    process.exitCode = 1;
  }
}
