// Pure, fail-closed policy for PR auto-merge. Executed ONLY from trusted main.
// GitHub metadata is untrusted input; this module never executes PR contents.
export const AUTO_MERGE_MAINTAINER = "hoangsvit";
export const AUTO_MERGE_BLOCK_LABEL = "do-not-merge";

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
  if (!lastApproval) return {authorized:false,reason:"Await @hoangsvit approval or /automerge <40-char-head-SHA>."};
  if (lastCancel && byTime(lastApproval,lastCancel) >= 0) {
    return {authorized:false,reason:"Auto-merge was cancelled by @hoangsvit."};
  }
  return {authorized:true,method:maintainerReview &&
    lastApproval.id === maintainerReview.id ? "review" : "comment"};
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

export function autoMergeDecision({pr,comments=[],reviews=[],runs=[],repo="ePlus-DEV/muse-invite-hub"}) {
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
  if (!authorization.authorized) return {eligible:false,reason:authorization.reason};
  if (!ciHasPassed({headSha:sha,runs})) {
    return {eligible:false,reason:"Current head SHA has no successful Validate website and invite catalog run."};
  }
  return {eligible:true,sha,method:authorization.method};
}
