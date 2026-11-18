import {
  planIssueChange, isAutoPublishableNewGithubInvite, isAutoPublishableNewSocialInvite,
  isAutoPublishableNewTelegramInvite,
  AUTO_PUBLISH_NEW_INVITE_MARKER, AUTO_PUBLISH_NEW_SOCIAL_INVITE_MARKER,
  AUTO_PUBLISH_NEW_TELEGRAM_INVITE_MARKER
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


// A workflow_dispatch created with the built-in GITHUB_TOKEN can leave the
// follow-up workflow_run auto-merge check without an event. Dispatch fresh CI
// using the existing independently authenticated eplus-bot token instead.
// This is strictly for a trusted, previously verified single-Issue bot PR.
export async function dispatchBotValidation({
  repository="ePlus-DEV/muse-invite-hub", branch, token, request=fetch
}) {
  if (repository!=="ePlus-DEV/muse-invite-hub" ||
      !/^auto\/issue-[1-9]\d*-invite$/.test(branch||"") || !token) {
    throw Error("Bot validation dispatch needs the trusted repo, invite branch and bot token.");
  }
  const headers={
    Authorization:"Bearer "+token,
    Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28"
  };
  const identity=await request("https://api.github.com/user",{headers});
  if(!identity.ok || (await identity.json()).login!=="eplus-bot") {
    throw Error("Validation dispatch requires an authenticated eplus-bot token.");
  }
  const response=await request(
    "https://api.github.com/repos/"+repository+"/actions/workflows/validate.yml/dispatches",{
      method:"POST",
      headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({ref:branch})
    });
  if(response.status!==204) {
    throw Error("eplus-bot validation dispatch returned HTTP "+response.status);
  }
}

// A transient GitHub merge error can arrive after GitHub committed the squash.
// Never retry the merge blindly; re-read the exact PR/head first.
export function isTransientMergeError(status) {
  return [500,502,503,504].includes(status);
}

export function confirmedMergeAfterError(pr, expectedHeadSha) {
  return pr?.merged === true && pr?.base?.ref === "main" &&
    pr?.head?.sha === expectedHeadSha &&
    /^[a-f0-9]{40}$/.test(pr?.merge_commit_sha || "");
}

// The 15-minute trusted schedule heals missed GITHUB_TOKEN merge dispatches,
// but must not run Pages repeatedly while a deploy is active or just failed.
export function shouldDispatchPagesRecovery(runs, nowMs=Date.now()) {
  if (!Array.isArray(runs) || !Number.isFinite(nowMs)) return false;
  const active = new Set(["requested","waiting","pending","queued","in_progress"]);
  if (runs.some(run => run?.conclusion === "success" || active.has(run?.status))) return false;
  return !runs.some(run => {
    const created = Date.parse(run?.created_at || "");
    return Number.isFinite(created) && created <= nowMs &&
      nowMs - created < 5 * 60 * 1000;
  });
}

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
function verifyTrustedInvitePR({
  pr,issue,catalog,files=[],fileContents={},repo="ePlus-DEV/muse-invite-hub"
}, eligible, marker) {
  if (!pr || !issue || !Array.isArray(catalog) ||
      !Array.isArray(files) || !fileContents ||
      typeof fileContents !== "object" || Array.isArray(fileContents)) return false;
  if (!["github-actions[bot]","eplus-bot"].includes(pr.user?.login) ||
      pr.head?.repo?.full_name !== repo ||
      pr.base?.ref !== "main" ||
      !Number.isSafeInteger(issue.number) || issue.number < 1 ||
      pr.head?.ref !== "auto/issue-"+issue.number+"-invite" ||
      !String(pr.body || "").includes(marker)) return false;

  try {
    const proposal=planIssueChange(issue,catalog);
    if (!eligible(issue,proposal)) return false;
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

export function verifyNewGithubInvitePR(args) {
  return verifyTrustedInvitePR(args,isAutoPublishableNewGithubInvite,AUTO_PUBLISH_NEW_INVITE_MARKER);
}

export function verifyNewSocialInvitePR(args) {
  return verifyTrustedInvitePR(args,isAutoPublishableNewSocialInvite,AUTO_PUBLISH_NEW_SOCIAL_INVITE_MARKER);
}

export function verifyNewTelegramInvitePR(args) {
  return verifyTrustedInvitePR(args,isAutoPublishableNewTelegramInvite,AUTO_PUBLISH_NEW_TELEGRAM_INVITE_MARKER);
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
  // GitHub marks some Ready PRs "unstable" when non-required checks or
  // reviewer status is unresolved. For a new GitHub invite, the trusted
  // Issue/record verifier and current-head full CI are the authorization.
  // Keep every other PR strictly "clean", and let the GitHub merge API
  // enforce any remaining branch protection rules.
  if (pr.mergeable !== true ||
      (pr.mergeable_state !== "clean" &&
       !(newInviteEligible && pr.mergeable_state === "unstable"))) {
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
    ? String(pr.body||"").includes(AUTO_PUBLISH_NEW_TELEGRAM_INVITE_MARKER)
      ? "verified-new-telegram-invite"
      : String(pr.body||"").includes(AUTO_PUBLISH_NEW_SOCIAL_INVITE_MARKER)
        ? "verified-new-social-invite" : "verified-new-github-invite"
    : safeDefault && !authorization.authorized ? "default-safe-docs" : authorization.method};
}


// The independent @eplus-bot token may approve only deterministic,
// fully verified new invite records (not arbitrary code or workflows).
// The SHA-bound review is performed by the trusted workflow, never PR code.
export function needsEplusBotReview({
  pr,comments=[],reviews=[],runs=[],files=[],newInviteEligible=false,
  repo="ePlus-DEV/muse-invite-hub"
}) {
  if (!newInviteEligible || pr?.user?.login !== "github-actions[bot]") {
    return {required:false,reason:"Only independently verified new invite PRs are eligible."};
  }
  const decision=autoMergeDecision({
    pr,comments,reviews,runs,files,newInviteEligible,repo
  });
  if (!decision.eligible) return {required:false,reason:decision.reason};
  if (reviews.some(review=>login(review.user)==="eplus-bot" &&
      review.state==="APPROVED" && review.commit_id===decision.sha)) {
    return {required:false,reason:"Exact head already approved by @eplus-bot."};
  }
  return {required:true,sha:decision.sha};
}
