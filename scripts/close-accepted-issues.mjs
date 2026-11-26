import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { planTelegramIssue } from "./issue-to-pr.mjs";
import { readCatalog, recordPath } from "./catalog.mjs";
import { isShareCodeIssue, issueCodes, originalIssueNumber, parseInviteCodes } from "./code-issue-map.mjs";

const REPO = "ePlus-DEV/muse-invite-hub";
const ORIGIN = "https://muse.eplus.dev";
const MARKER = "<!-- muse-accepted-contribution -->";
const SHA = /^[a-f0-9]{40}$/;
const CODE = /^[A-Z0-9]{6}$/;

export function acceptedCandidate(pr) {
  const match = /^auto\/issue-([1-9][0-9]*)-(invite|count|feedback)$/.exec(pr?.head?.ref || "");
  if (!match || !pr.merged_at || !SHA.test(pr.merge_commit_sha || "") ||
      pr.head?.repo?.full_name !== REPO || pr.base?.ref !== "main" ||
      !["github-actions[bot]","eplus-bot"].includes(pr.user?.login)) return null;
  const issueNumber = Number(match[1]), kind = match[2];
  if (!Number.isSafeInteger(issueNumber)) return null;
  const single=/\bCode: \*\*([A-Z0-9]{6})\*\*\. Change:/.exec(pr.body || "")?.[1];
  const group=/\bCodes: \*\*([A-Z0-9]{6}(?:, [A-Z0-9]{6}){1,9})\*\*\. Change:/.exec(pr.body || "")?.[1];
  if (!single && !group || (group && kind!=="invite")) return null;
  let codes;
  try {
    codes = parseInviteCodes(group || single);
  } catch { return null; }
  if ((group && codes.length<2) || (single && codes.length!==1)) return null;
  const code=codes[0], label=codes.join(", ");
  const body=pr.body||"";
  const githubSource=body.includes("Prepared from public Issue #" + issueNumber + " by @");
  // Bot-created Telegram submissions use a different, reviewed-only PR header.
  // Historical PRs wrote "undefined" instead of the public sender handle;
  // the original Issue and exact published source are verified below, never
  // the untrusted header's claim about Telegram account ownership.
  const telegramSource=kind==="invite" && codes.length===1 &&
    body.includes("Prepared from consented Telegram contributor ") &&
    body.includes(" in public Issue #"+issueNumber+". GitHub Issue author @") &&
    body.includes("Change: **add Telegram source**.");
  if (!CODE.test(code) ||
      pr.title !== "data: review " + label + " " + kind + " (issue #" + issueNumber + ")" ||
      (!githubSource && !telegramSource)) return null;
  return { issueNumber, kind, code, ...(group?{codes}:{}),
    ...(telegramSource?{telegram:true}:{}),
    prNumber:pr.number, mergeSha:pr.merge_commit_sha };
}

export function acceptanceComment({ code, codes=[code], prNumber }) {
  const links = codes.map(value =>
    "[View " + value + "](" + ORIGIN + "/codes/" + value + "/)");
  return [
    MARKER,
    "✅ **Your contribution has been accepted and published on Muse Invite Hub.**",
    "",
    (codes.length===1?"**Invite code:** ":"**Invite codes:** ") + codes.join(", "),
    (codes.length===1?"**Published detail:** ":"**Published details:** ") + links.join(" · "),
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
      if (!["github-actions[bot]","eplus-bot"].includes(entry.user?.login)) continue;
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
      const codes=candidate.codes || [code];
      let issue;
      try {
        issue = await api("GET","issues/" + issueNumber);
      } catch (error) {
        // Contributors may delete a source Issue after its PR was merged.
        // It can no longer be notified or closed, but must not block acceptance
        // of unrelated contributions on future successful deployments.
        // Never mask permission errors, rate limits, or temporary API failures.
        if (error.message === "GitHub API GET issues/" + issueNumber + ": HTTP 404") {
          summary.skipped++;
          console.warn("Skipping missing original Issue #" + issueNumber +
            "; no acceptance or closure was claimed.");
          continue;
        }
        throw error;
      }
      // A previously completed Telegram Issue may have been closed manually
      // before the broken acceptance matcher was fixed. Backfill its missing
      // detail-link comment without reopening or re-closing the discussion.
      const closedTelegram=candidate.telegram && issue.state==="closed" &&
        issue.state_reason==="completed";
      if ((issue.state!=="open"&&!closedTelegram) || issue.pull_request) {
        summary.skipped++; continue;
      }
      const expectedTitle = {
        invite:"[Invite]",count:"[Count update]",feedback:"[Code feedback]"
      }[kind];
      if (!(issue.title?.startsWith(expectedTitle) ||
            (kind === "invite" && isShareCodeIssue(issue))) ||
          !codes.every(value=>issueCodes(issue).includes(value)) ||
          !codes.every(value=>published.has(value))) { summary.pending++; continue; }
      if (candidate.telegram) {
        // Telegram identity is not GitHub ownership. Re-check the trusted
        // Issue's bot marker, author, consent and public profile before
        // accepting even a merged bot PR. Do not use PR text as proof.
        const checked=planTelegramIssue(issue,[]);
        const verified=checked.outcome==="proposal" &&
          checked.action==="add Telegram source" && checked.code===code &&
          checked.data.find(row=>row.code===code);
        const record=records.find(row=>row.code===code);
        if (!verified || !record ||
            verified.sourceUrl!==record.sourceUrl ||
            !pr.body?.includes("GitHub Issue author @"+issue.user.login+
              " is the bot credential, not the code owner.")) {
          summary.pending++; continue;
        }
        if (verified.id!==record.id ||
            verified.feedbackIssueNumber!==issueNumber) {
          // Duplicate Telegram submission (e.g. Issue #641 for a code first
          // accepted from Issue #640): planning this Issue generates a
          // record keyed to this Issue, while the published record stays
          // keyed to the original. Accept-close the duplicate only when
          // the canonical Issue is already closed and carries this code;
          // the merged PR's exact files are still verified below.
          const canonicalNumber=originalIssueNumber(record);
          let canonicalClosed=false;
          if (Number.isSafeInteger(canonicalNumber) && canonicalNumber>0 &&
              canonicalNumber!==issueNumber) {
            try {
              const canonicalIssue=await api("GET","issues/"+canonicalNumber);
              canonicalClosed=canonicalIssue.state==="closed" &&
                !canonicalIssue.pull_request &&
                issueCodes(canonicalIssue).includes(code);
            } catch { canonicalClosed=false; }
          }
          if (!canonicalClosed) { summary.pending++; continue; }
        }
      }
      const files = await api("GET","pulls/" + prNumber + "/files?per_page=100");
      const selected=codes.map(value=>records.find(item=>item.code===value));
      const recordFiles=selected.map(item=>item?.id?recordPath(item):null);
      // Each batch changes precisely one independent JSON record per code.
      // Preserve legacy single-record and one-time migration PR support.
      const ordinary = codes.length===1 && files.length===1 &&
        ["data/invites.json",recordFiles[0]].includes(files[0].filename);
      const batch = codes.length>1 && files.length===codes.length &&
        recordFiles.every(path=>path && files.some(file=>file.filename===path));
      const migration = codes.length===1 && prNumber===95 && recordFiles[0] &&
        files.some(file=>file.filename===recordFiles[0]);
      if (selected.some(item=>!item) || !(ordinary || batch || migration)) {
        summary.pending++; continue;
      }
      // The deployed main commit must contain the PR merge, even for quota or
      // feedback updates where the code's detail page existed before this PR.
      const comparison = await api("GET","compare/" + mergeSha + "..." + deployedSha);
      if (!["identical","ahead"].includes(comparison.status)) { summary.pending++; continue; }
      let allLive=true;
      for (const value of codes) {
        if (!await liveDetailReady(request, value)) { allLive=false; break; }
      }
      if (!allLive) { summary.pending++; continue; }

      // Order matters: post the accepted detail link, THEN close the Issue.
      const flags = await issueCommentFlags(api,issueNumber);
      // Once a user has reported on a closed canonical Issue, do not let the
      // historical acceptance PR close it again on every production deploy.
      if (flags.feedbackReopened) { summary.skipped++; continue; }
      if (!flags.accepted) {
        await api("POST","issues/" + issueNumber + "/comments",
          {body:acceptanceComment({code,codes,prNumber})});
        summary.notified++;
      }
      if (closedTelegram) {
        // Keep the original completed state intact; do not reopen or
        // generate another comment on the next successful deployment.
        summary.skipped++;
        continue;
      }
      await api("PATCH","issues/" + issueNumber,{state:"closed",state_reason:"completed"});
      summary.closed++;
      console.log("Accepted Issue #" + issueNumber + " published codes: " + codes.join(", "));
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
