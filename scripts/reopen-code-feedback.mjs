/* Trusted main-only Issue comment handler. Feedback never edits public code status. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { issueCodes, issueMarker, originalIssueNumber, withCanonicalIssueRefs, REPO } from "./code-issue-map.mjs";
import { readCatalog } from "./catalog.mjs";

const ACK_MARKER = "<!-- muse-code-feedback-reopened -->";

export function feedbackCodeForIssue(issue, catalog, commentBody="") {
  if (!issue || issue.pull_request || !Number.isSafeInteger(issue.number)) return null;
  const codes = issueCodes(issue);
  // A multi-code Issue may be the canonical thread for several separate
  // listings. Prefer the explicitly named code in the user's feedback.
  const requested = /^Code:\s*([A-Z0-9-]{4,32})\s*$/mi.exec(commentBody)?.[1];
  const ordered = requested && codes.includes(requested)
    ? [requested,...codes.filter(code=>code!==requested)] : codes;
  for (const code of ordered) {
    const item = catalog.find(entry=>entry.code===code);
    if (!item) continue;
    const canonicalNumber = originalIssueNumber(item);
    if (canonicalNumber !== null) {
      if (canonicalNumber===issue.number) return code;
      continue;
    }
    if (String(issue.body || "").includes(issueMarker(code)) ||
        String(issue.body || "").includes("<!-- muse-code-feedback-root:" + code + " -->")) return code;
  }
  return null;
}

// A pasted referral for a DIFFERENT code is a new submission, not feedback
// on this canonical Issue. Only classify explicit stand-alone code labels
// accompanied by the official Muse join link; ambiguous replies stay pending.
export function unrelatedReferralCode(body, canonicalCodes) {
  if (typeof body !== "string" || body.length > 3500 ||
      !Array.isArray(canonicalCodes) || !canonicalCodes.length ||
      !/https:\/\/muse\.ai\/join(?:[/?#]|\s|$)/i.test(body)) return null;
  const labels=[...body.matchAll(/^[ \t]*(?:邀请码|邀请代码|Invite\s+code|Code|C[oó]digo|Mã\s*mời)\s*[:：]\s*([A-Z0-9]{6})[ \t]*$/gimu)];
  if (labels.length !== 1) return null;
  const candidate=labels[0][1].toUpperCase();
  if (canonicalCodes.some(code=>code.toUpperCase()===candidate ||
      new RegExp("(^|[^A-Z0-9])"+code+"([^A-Z0-9]|$)","i").test(body))) return null;
  return candidate;
}

export function shouldReopen(issue, comment, catalog) {
  if (!comment || !Number.isSafeInteger(comment.id) ||
      !comment.body?.trim() || !comment.user?.login ||
      comment.user.type === "Bot" ||
      comment.user.login.endsWith("[bot]") || comment.user.login === "eplus-bot") return false;
  return issue?.state === "closed" && Boolean(feedbackCodeForIssue(issue, catalog)) &&
    !unrelatedReferralCode(comment.body,issueCodes(issue));
}

async function github(method, path, token, body) {
  const response = await fetch("https://api.github.com/repos/" + REPO + "/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw Error("GitHub " + method + " " + path + ": HTTP " + response.status);
  return response.status === 204 ? null : response.json();
}

export async function reopenOnFeedback({
  repository=process.env.GITHUB_REPOSITORY,
  token=process.env.GH_TOKEN,
  issueNumber=Number(process.env.ISSUE_NUMBER),
  commentId=Number(process.env.COMMENT_ID),
  catalog
} = {}) {
  if (repository !== REPO || !token ||
      !Number.isSafeInteger(issueNumber) || issueNumber <= 0 ||
      !Number.isSafeInteger(commentId) || commentId <= 0) {
    throw Error("Trusted repository, token, issue and comment identifiers required");
  }
  const rawEntries = catalog ?? readCatalog();
  const roots = catalog ? {} : JSON.parse(readFileSync(new URL("../data/code-issues.json", import.meta.url), "utf8"));
  const entries = withCanonicalIssueRefs(rawEntries, roots);
  const issue = await github("GET", "issues/" + issueNumber, token);
  const comment = await github("GET", "issues/comments/" + commentId, token);
  if (comment.issue_url?.split("/").at(-1) !== String(issueNumber)) {
    return {outcome:"ignored",reason:"Comment does not belong to this Issue."};
  }
  const foreign=unrelatedReferralCode(comment.body,issueCodes(issue));
  if (foreign && feedbackCodeForIssue(issue,entries)) {
    const marker="<!-- muse-unrelated-referral:"+commentId+" -->";
    const comments=await github("GET","issues/"+issueNumber+"/comments?per_page=100",token);
    if (!comments.some(row=>["github-actions[bot]","eplus-bot"].includes(row.user?.login) &&
        String(row.body||"").includes(marker))) {
      await github("POST","issues/"+issueNumber+"/comments",token,{body:marker+"\n"+
        "ℹ️ **"+foreign+"** is a separate invite code, not feedback on this Issue. "+
        "Please submit it through the [Share Code form](https://github.com/"+REPO+
        "/issues/new?template=share-code.yml) with the required ownership/public-sharing "+
        "confirmations. This comment has not been added to the public catalog."});
    }
    return {outcome:"redirected",issueNumber,code:foreign};
  }
  if (!shouldReopen(issue, comment, entries)) {
    console.log("No action: not new community feedback on a closed canonical code Issue.");
    return { outcome:"ignored" };
  }
  const code = feedbackCodeForIssue(issue, entries, comment.body);
  // Marker prevents the older accepted-Issue reconciler from closing the
  // reopened feedback thread during the next Pages deployment.
  const note = ACK_MARKER + "\nNew community feedback for **" + code +
    "** by @" + comment.user.login + " has been received. Reopening this existing " +
    "Issue for maintainer review. A comment is **not** verification by Muse.";
  const comments = await github("GET", "issues/" + issueNumber + "/comments?per_page=100", token);
  if (!comments.some(x => x.user?.login === "github-actions[bot]" &&
       x.body?.includes(ACK_MARKER))) {
    await github("POST", "issues/" + issueNumber + "/comments", token, {body:note});
  }
  await github("PATCH", "issues/" + issueNumber, token, {state:"open"});
  console.log("Reopened original Issue #" + issueNumber + " for " + code);
  return { outcome:"reopened", issueNumber, code };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await reopenOnFeedback();
}
