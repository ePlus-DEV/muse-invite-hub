import {
  planIssueChange, isAutoPublishableNewGithubInvite,
  AUTO_PUBLISH_NEW_INVITE_MARKER
} from "./issue-to-pr.mjs";
import { changedRecord, changedRecords } from "./catalog.mjs";

// Pure, fail-closed policy for PR auto-merge. Executed ONLY from trusted main.
// GitHub metadata is untrusted input; this module never executes PR contents.
export const AUTO_MERGE_MAINTAINER = "hoangsvit";
export const AUTO_MERGE_BLOCK_LABEL = "do-not-merge";

// Safe, default-on path: maintainer-authored documentation-only PRs.
// Catalog data, code, templates, workflows, configuration, and mixed PRs
// deliberately require per-head authorization instead.
export const AUTO_MERGE_DEFAULT_AUTHOR = "hoangsvit";
export const AUTO_MERGE_MAX_DOC_FILES = 15;

export function qualifiesForDefaultAutoMerge(pr, files=[]) {
  if (login(pr?.user) !== AUTO_MERGE_DEFAULT_AUTHOR) return false;
  if (!Number.isSafeInteger(pr?.changed_files) ||
      pr.changed_files < 1 || pr.changed_files > AUTO_MERGE_MAX_DOC_FILES ||
      !Array.isArray(files) || files.length !== pr.changed_files) return false;
  return files.every(file => {
    if (!["added","modified"].includes(file?.status) || file.previous_filename) return false;
    const name = String(file.filename || "");
    // Reject relative-directory tricks even when the name happens to end in .md.
    if (name.split("/").some(part => part === "." || part === "..")) return false;
    return ["README.md", "CONTRIBUTING.md"].includes(name) ||
      /^docs\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.md$/.test(name);
  });
}


const AUTO_MERGE_COMMAND = /^\/automerge\s+([0-9a-f]{40})\s*$/i;
const AUTO_MERGE_CANCEL = /^\/automerge\s+(?:off|cancel)\s*$/i;

const byTime = (a, b) =>
  Date.parse(a.at || "") - Date.parse(b.at || "") || a.id - b.id;

function login(user) {
  return String(user?.login || "").toLowerCase();
}

function activeReviewStates(reviews) {
  const latest = new Map();
  for (const review of reviews || []) {
    const state = String(review?.state || "").toUpperCase();
    const who = login(review?.user);
    if (!who || !["APPROVED","CHANGES_REQUESTED"].includes(state)) continue;
    const entry = { id: review.id || 0, at: review.submitted_at, state,
      sha: review.commit_id, who };
    const previous = latest.get(who);
    if (!previous || byTime(previous,entry) <= 0) latest.set(who,entry);
  }
  return [...latest.values()];
}

export function getMaintainerAuthorization({headSha,comments=[],reviews=[]}) {
  if (!/^[a-f0-9]{40}$/i.test(headSha || "")) return {authorized:false,reason:"Invalid PR head SHA."};

  const reviewStates = activeReviewStates(reviews);
  if (reviewStates.some(review => review.state === "CHANGES_REQUESTED")) {
    return {authorized:false,reason:"A reviewer still requests changes."};
  }

  const maintainerReview = reviewStates.find(review =>
    review.who === AUTO_MERGE_MAINTAINER &&
    review.state === "APPROVED" && review.sha === headSha
  );

  const commands = (comments || [])
    .filter(comment => login(comment?.user) === AUTO_MERGE_MAINTAINER)
    .map(comment => {
      const body = String(comment?.body || "").trim();
      const match = AUTO_MERGE_COMMAND.exec(body);
      if (match) return {at:comment.created_at,id:comment.id || 0,
        kind:"approve",sha:match[1].toLowerCase()};
      if (AUTO_MERGE_CANCEL.test(body)) return {
        at:comment.created_at,id:comment.id || 0,kind:"cancel"
      };
      return null;
    }).filter(Boolean).sort(byTime);

  const lastCancel = commands.filter(c => c.kind === "cancel").at(-1);
  const approvals = [
    ...commands.filter(c => c.kind === "approve" && c.sha === headSha.toLowerCase()),
    ...(maintainerReview ? [{kind:"approve",at:maintainerReview.at,
      id:maintainerReview.id}] : [])
  ].sort(byTime);

  const lastApproval = approvals.at(-1);
  if (lastCancel && (!lastApproval || byTime(lastApproval,lastCancel) <= 0)) {
    return {authorized:false,reason:"Auto-merge was cancelled by @hoangsvit."};
  }
  if (!lastApproval) return {authorized:false,reason:"Await @hoangsvit approval or /automerge <40-char-head-SHA>."};
  return {authorized:true,method:maintainerReview &&
    lastApproval.id === maintainerReview.id ? "review" : "comment"};
}

// Independently verify that the bot PR is an exact deterministic projection
// of a *current* public Issue on trusted main. Never trust the PR title,
// checklist summary, patch text, or bot marker alone.
export function verifyNewGithubInvitePR({
  pr,issue,catalog,files=[],fileContents={},repo="ePlus-DEV/muse-invite-hub"
}) {
  if (!pr || !issue || !Array.isArray(catalog) ||
      !Array.isArray(files) || !fileContents ||
      typeof fileContents !== "object" || Array.isArray(fileContents)) return false;
  if (pr.user?.login !== "github-actions[bot]" ||
      pr.head?.repo?.full_name !== repo ||
      pr.base?.ref !== "main" ||
      !Number.isSafeInteger(issue.number) || issue.number < 1 ||
      pr.head?.ref !== "auto/issue-"+issue.number+"-invite" ||
      !String(pr.body || "").includes(AUTO_PUBLISH_NEW_INVITE_MARKER)) return false;

  try {
    const proposal=planIssueChange(issue,catalog);
    if (!isAutoPublishableNewGithubInvite(issue,proposal)) return false;
    const codes=proposal.codes || [proposal.code];
    if (pr.title !== "data: review "+codes.join(", ")+" invite (issue #"+issue.number+")") return false;
    const expected=codes.length === 1
      ? [changedRecord(catalog,proposal.data,codes[0])]
      : changedRecords(catalog,proposal.data,codes);
    if (pr.changed_files !== expected.length ||
        files.length !== expected.length ||
        Object.keys(fileContents).length !== expected.length) return false;
    return expected.every(record => {
      const changed=files.find(file=>file.filename === record.path);
      return changed?.status === "added" &&
        changed.previous_filename === undefined &&
        fileContents[record.path] === record.content;
    });
  } catch {
    // Duplicated, edited, unsafe, malformed and now-published code Issues
    // require maintainer review instead of automatic publication.
    return false;
  }
}

export function ciHasPassed({headSha,runs=[]}) {
  const relevant=(runs || [])
    .filter(run=>run.head_sha === headSha &&
      ["pull_request","workflow_dispatch"].includes(run.event) &&
      run.name === "Validate website and invite catalog")
    .sort((a,b)=>Date.parse(b.created_at||"")-Date.parse(a.created_at||""));
  const latest = relevant.find(run=>run.conclusion !== "action_required");
  return Boolean(latest && latest.status === "completed" && latest.conclusion === "success");
}

export function autoMergeDecision({pr,comments=[],reviews=[],runs=[],files=[],newInviteEligible=false,repo="ePlus-DEV/muse-invite-hub"}) {
  if (!pr || pr.state !== "open" || pr.draft) return {eligible:false,reason:"PR is not open and ready."};
  if (pr.base?.ref !== "main" || pr.head?.repo?.full_name !== repo) {
    return {eligible:false,reason:"Only same-repository PRs targeting main are eligible."};
  }
  if (pr.mergeable !== true || pr.mergeable_state !== "clean") {
    return {eligible:false,reason:"PR is conflicted, stale or blocked by GitHub merge rules."};
  }
  if ((pr.labels || []).some(label =>
    String(label?.name || "").toLowerCase() === AUTO_MERGE_BLOCK_LABEL)) {
    return {eligible:false,reason:"The do-not-merge label is present."};
  }
  const sha=pr.head.sha;
  const authorization=getMaintainerAuthorization({headSha:sha,comments,reviews});
  // An outstanding CHANGES_REQUESTED review or a maintainer cancellation
  // blocks *both* the default docs policy and the explicit review path.
  if (authorization.reason === "A reviewer still requests changes." ||
      authorization.reason === "Auto-merge was cancelled by @hoangsvit.") {
    return {eligible:false,reason:authorization.reason};
  }
  const safeDefault=qualifiesForDefaultAutoMerge(pr,files);
  if (!safeDefault && !newInviteEligible && !authorization.authorized) {
    return {eligible:false,reason:authorization.reason};
  }
  if (!ciHasPassed({headSha:sha,runs})) {
    return {eligible:false,reason:"Current head SHA has no successful Validate website and invite catalog run."};
  }
  return {eligible:true,sha,method:newInviteEligible && !authorization.authorized
    ? "verified-new-github-invite" : safeDefault && !authorization.authorized
      ? "default-safe-docs" : authorization.method};
}
