/* Issue-comment -> review-only Draft PR. Never treat a public comment as Muse verification.
 * Only a human-submitted, strictly formatted comment on the single mapped Issue is eligible.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { planIssueChange } from "./issue-to-pr.mjs";
import { feedbackCodeForIssue } from "./reopen-code-feedback.mjs";
import { REPO, withCanonicalIssueRefs } from "./code-issue-map.mjs";
import { listedPlatform } from "./source-platform.mjs";
import { readCatalog, fetchGitHubCatalog, changedRecord } from "./catalog.mjs";
import { addReviewedFeedback, ledgerPath, parseReviewableFeedback } from "./feedback-ledger.mjs";

const CODE = /^[A-Z0-9]{6}$/;
const API = "https://api.github.com/repos/" + REPO + "/";
const MAX_COMMENT = 3500;
const outcomes = new Map([
  ["Muse accepted my code", "Muse accepted the code (worked for me)"],
  ["Muse rejected or could not redeem my code", "Muse did not accept the code"]
]);

function lines(body) {
  const result = {};
  for (const line of body.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z ]{1,48}):\s*(.*)$/.exec(line.trim());
    if (match && !Object.hasOwn(result,match[1])) result[match[1]]=match[2].trim();
  }
  return result;
}

// Recognize one narrow, owner-authored count-summary format without rewriting
// their comment or forging a Muse-screen confirmation. Such reports create
// REVIEW-ONLY Draft PRs; an explicit screen confirmation remains a review task.
function narrativeOwnerCount(issue, comment, catalog, code, item) {
  const rows = comment.body.trim().split(/\r?\n/).map(row => row.trim());
  const header = /^Owner count update\s*[—–:-]\s*([A-Z0-9]{6})\s*$/i.exec(rows[0] || "");
  if (!header) return null;
  const review = reason => ({outcome:"needs-review",kind:"count",code,reason});
  if (header[1].toUpperCase() !== code) return review("Owner count header does not match the canonical Issue code.");
  if (listedPlatform(item) !== "GitHub") return review("Social-source ownership cannot be established from a GitHub comment.");
  const sameOwner = Number.isSafeInteger(item.submittedById)
    ? item.submittedById === comment.user?.id
    : Boolean(item.submittedBy) && item.submittedBy.toLowerCase() === comment.user.login.toLowerCase();
  if (!sameOwner) return review("Only the original GitHub code owner may report owner-only quota.");
  if (!rows.slice(1).some(row => /^I am the owner of this invite code\b/i.test(row))) {
    return review("The commenter must explicitly claim ownership of this code.");
  }

  const values = new Map();
  for (const row of rows.slice(1)) {
    const match = /^(?:[-*]\s*)?(Total invites|Remaining invites|Used invites):\s*(.+)$/i.exec(row);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (values.has(key)) return review("Duplicate owner-count field; no number was selected.");
    if (!/^(?:0|[1-9][0-9]{0,3})$/.test(match[2])) {
      return review("Owner-count fields must be non-negative whole numbers.");
    }
    const number = Number(match[2]);
    if (number > 1000) return review("Owner-count value exceeds the supported range.");
    values.set(key, number);
  }
  if (!["total invites","remaining invites","used invites"].every(key => values.has(key))) {
    return review("Provide all three owner-count figures: total, remaining and used.");
  }
  const total = values.get("total invites");
  const remaining = values.get("remaining invites");
  const used = values.get("used invites");
  if (total <= 0 || used > total || remaining > total || total - used !== remaining) {
    return review("Owner-count figures do not reconcile (total - used must equal remaining).");
  }
  if (!Number.isFinite(Date.parse(comment.created_at || ""))) {
    return review("Comment is missing a reliable timestamp.");
  }
  const date = new Date(comment.created_at).toISOString().slice(0,10);
  if (item.usageReportedAt && item.usageReportedAt > date) {
    return review("A newer owner report is already published.");
  }
  if (item.reportedCapacity === total && item.reportedUses === used &&
      item.usageReportedAt === date) {
    return {outcome:"duplicate",kind:"count",code,reason:"This dated owner report is already published."};
  }
  const data = structuredClone(catalog);
  const target = data.find(entry => entry.code === code);
  const hadSnapshot = typeof target.usageReportedAt === "string" &&
    [target.reportedCapacity,target.reportedUses,target.reportedRemaining]
      .some(value => value !== undefined);
  delete target.reportedRemaining;
  target.reportedCapacity = total;
  target.reportedUses = used;
  target.usageReportedAt = date;
  if (hadSnapshot) target.quotaUpdateCount = (target.quotaUpdateCount || 0) + 1;
  return {
    outcome:"proposal",kind:"count",code,action:"review owner-reported count",data,
    branch:"auto/comment-"+issue.number+"-"+comment.id+"-count",
    issueNumber:issue.number,commentId:comment.id,reporter:comment.user.login,
    notice:"The original owner-authored comment reports "+total+" total, "+used+
      " used and "+remaining+" remaining. The comment does NOT explicitly say these "+
      "figures came from the owner's own Muse invite screen. Obtain that confirmation "+
      "before merging. This is not a live or Muse-verified balance."
  };
}

// This parser never promotes an informal conversation into a verified report.
export function planCommentProposal(issue, comment, catalog) {
  if (!Array.isArray(catalog) || typeof comment?.body !== "string" ||
      comment.body.length > MAX_COMMENT || !comment.user?.login ||
      comment.user?.type === "Bot" || comment.user?.login.endsWith("[bot]") ||
      comment.user?.login === "eplus-bot" ||
      !Number.isSafeInteger(comment.id) || comment.id <= 0) return {outcome:"ignored"};
  const code = feedbackCodeForIssue(issue,catalog,comment.body);
  if (!code) return {outcome:"ignored"};
  const fields = lines(comment.body);
  const item = catalog.find(entry=>entry.code===code);
  if (!item) return {outcome:"ignored"};
  if (fields.Code !== code) {
    return narrativeOwnerCount(issue,comment,catalog,code,item) || {outcome:"ignored"};
  }
  let kind, body, title;
  const header = "### Invite code\n\n"+code+"\n\n### Listing platform\n\n"+listedPlatform(item)+"\n\n";
  if (fields.Result) {
    if (!outcomes.has(fields.Result)) return {outcome:"needs-review",code,reason:"No standard redemption outcome was selected."};
    kind="feedback";
    title="[Code feedback] "+code;
    body=header+"### What happened?\n\n"+outcomes.get(fields.Result)+"\n";
    // A later comment cannot silently overwrite a newer dated catalog report.
    const posted=String(comment.created_at||"").slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(posted) ||
        (item.checkedAt && item.checkedAt > posted)) {
      return {outcome:"needs-review",code,reason:"Feedback is older than the latest catalog check."};
    }
  } else if (fields["Update type"] === "Owner count") {
    kind="count";
    title="[Count update] "+code;
    if (fields["Owner confirmation"] !== "I confirm these figures came from my own Muse invite screen.") {
      return {outcome:"needs-review",code,reason:"Owner confirmation is required for quota updates."};
    }
    if (!CODE.test(code) || !fields["Remaining invites"] && !fields["Total invites"]) {
      return {outcome:"needs-review",code,reason:"Provide an actual quota figure."};
    }
    body=header+
      "### Remaining invites shown by Muse\n\n"+(fields["Remaining invites"]||"_No response_")+"\n\n"+
      "### Total invite quota shown by Muse (if known)\n\n"+(fields["Total invites"]||"_No response_")+"\n\n"+
      "### Already used invites (if known)\n\n"+(fields["Used invites"]||"_No response_")+"\n\n"+
      "### Confirmation\n\n- [x] I confirm that these figures came from a Muse invite screen, not from copy-click counts or guesses.\n";
  } else {
    return {outcome:"ignored"};
  }
  if (!Number.isFinite(Date.parse(comment.created_at||""))) {
    return {outcome:"needs-review",code,reason:"Comment is missing a reliable timestamp."};
  }
  const synthetic={
    number:comment.id,title,body,user:comment.user,
    created_at:comment.created_at,updated_at:comment.created_at,
    state:"open"
  };
  try {
    const proposed=planIssueChange(synthetic,catalog);
    if (proposed.outcome!=="proposal") {
      return {...proposed,code,kind};
    }
    return {...proposed,kind,code,
      branch:"auto/comment-"+issue.number+"-"+comment.id+"-"+kind,
      issueNumber:issue.number,commentId:comment.id,reporter:comment.user.login};
  } catch(error) {
    return {outcome:"needs-review",code,kind,
      reason:String(error.message).slice(0,250)};
  }
}

async function api(method,path,token,body,allow404=false) {
  const response=await fetch(API+path,{
    method,
    headers:{
      Authorization:"Bearer "+token,
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      ...(body===undefined?{}:{"Content-Type":"application/json"})
    },
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(25000)
  });
  if(allow404&&response.status===404)return null;
  if(!response.ok)throw Error("GitHub "+method+" "+path+" HTTP "+response.status+
    " "+(await response.text()).slice(0,180));
  return response.status===204?null:response.json();
}

// A recognized but rejected report must not disappear behind a green workflow.
async function notifyReviewRequired(issueNumber,commentId,reason,token) {
  const marker="<!-- muse-comment-needs-review:"+commentId+" -->";
  for(let page=1;page<=10;page++){
    const comments=await api("GET","issues/"+issueNumber+"/comments?per_page=100&page="+page,token);
    if(comments.some(row=>row.user?.login==="github-actions[bot]" &&
        row.body?.includes(marker)))return;
    if(comments.length<100)break;
    if(page===10)throw Error("Too many comments to deduplicate feedback notices.");
  }
  const instructions=reason==="Owner confirmation is required for quota updates."
    ? "Edit your original comment and enter the exact confirmation line: " +
      "\`Owner confirmation: I confirm these figures came from my own Muse invite screen.\` " +
      "Only do this if you actually checked the numbers in your own Muse account."
    : "Please edit your original comment to correct the report or ask a maintainer to review it.";
  await api("POST","issues/"+issueNumber+"/comments",token,{
    body:marker+"\n⚠️ **No Draft PR created for comment #"+commentId+"**: "+
      String(reason||"Requires maintainer review.").slice(0,250)+"\n\n"+
      instructions+"\n\nNo public catalog data was changed."
  });
}

export async function proposeCommentDraft({
  repository=process.env.GITHUB_REPOSITORY,
  token=process.env.GH_TOKEN,
  issueNumber=Number(process.env.ISSUE_NUMBER),
  commentId=Number(process.env.COMMENT_ID),
  catalog
}={}) {
  if(repository!==REPO || !token || !Number.isSafeInteger(issueNumber)||issueNumber<=0||
    !Number.isSafeInteger(commentId)||commentId<=0) throw Error("Trusted repository, token and comment IDs required.");
  const roots=JSON.parse(readFileSync(new URL("../data/code-issues.json",import.meta.url),"utf8"));
  const entries=withCanonicalIssueRefs(catalog??readCatalog(),roots);
  const [issue,comment]=await Promise.all([
    api("GET","issues/"+issueNumber,token),
    api("GET","issues/comments/"+commentId,token)
  ]);
  if(comment.issue_url?.split("/").at(-1)!==String(issueNumber) || issue.pull_request) {
    return {outcome:"ignored",reason:"Comment does not belong to a canonical Issue"};
  }
  const eligible=parseReviewableFeedback(issue,comment,entries);
  // Even when a subjective report does not change the current catalog status
  // (same outcome, an older report or a negative owner claim), it deserves a
  // review-only JSON ledger proposal, not an invisible uncounted comment.
  const proposalForReport=(catalog,change)=>({
    outcome:"proposal",kind:"feedback",code:eligible.code,
    branch:"auto/comment-"+issue.number+"-"+comment.id+"-feedback",
    data:catalog,reporter:comment.user.login,
    action:"review community experience for persistent feedback ledger",
    notice:"Review the original comment before merging. This records a self-reported experience, not a Muse-verified redemption."+
      (change?.reason ? " Status was not changed: "+change.reason : "")
  });
  let planned=planCommentProposal(issue,comment,entries);
  if(eligible && planned.outcome!=="proposal") {
    planned=proposalForReport(entries,planned);
  }
  if(planned.outcome!=="proposal") {
    if(planned.outcome==="needs-review") {
      await notifyReviewRequired(issueNumber,commentId,planned.reason,token);
    }
    console.log(JSON.stringify(planned));
    return planned;
  }
  const {code,kind,branch}=planned;
  const existing=await api("GET","pulls?state=open&per_page=100",token);
  const own=existing.filter(pr=>pr.head?.repo?.full_name===REPO);
  const same=own.find(pr=>pr.head.ref===branch);
  if(same)return {outcome:"already-open",url:same.html_url,code};
  // Reject overlapping unreviewed changes to the SAME entry from other PRs.
  const ref=await api("GET","git/ref/heads/main",token);
  const mainSha=ref.object.sha;
  const mainCatalog=withCanonicalIssueRefs(await fetchGitHubCatalog(
    (path,allow404=false)=>api("GET",path,token,undefined,allow404),mainSha),roots);
  const mainReport=parseReviewableFeedback(issue,comment,mainCatalog);
  let current=planCommentProposal(issue,comment,mainCatalog);
  if(mainReport && current.outcome!=="proposal") {
    current=proposalForReport(mainCatalog,current);
  }
  if(current.outcome!=="proposal") {
    if(current.outcome==="needs-review") {
      await notifyReviewRequired(issueNumber,commentId,current.reason,token);
    }
    return current;
  }
  // Independent branches from main only; never stack on an unmerged PR.
  for(const pr of own) {
    if(!pr.head.ref.startsWith("auto/"))continue;
    const title=/^data: review (.+) (?:invite|count|feedback) \(issue #[1-9][0-9]*\)$/.exec(String(pr.title||""));
    const grouped=title ? title[1].split(", ") : [];
    if (grouped.includes(code) ||
        String(pr.title||"").startsWith("data: review "+code+" ")) {
      return {outcome:"needs-review",code,kind,reason:"A Draft PR already changes this code: "+pr.html_url};
    }
  }
  // Existing leftover branches are never modified. Repeated event delivery is idempotent.
  const existingBranch=await api("GET","git/ref/heads/"+branch.split("/").map(encodeURIComponent).join("/"),token,undefined,true);
  if(existingBranch)return {outcome:"needs-review",code,reason:"Previous proposal branch exists; review before retry: "+branch};
  const parent=await api("GET","git/commits/"+mainSha,token);
  const entriesToCommit=[];
  const addFile=async(path,content)=>{
    const blob=await api("POST","git/blobs",token,{content,encoding:"utf-8"});
    entriesToCommit.push({path,mode:"100644",type:"blob",sha:blob.sha});
  };
  if(kind==="feedback") {
    // This JSON update is part of the exact Draft PR reviewed by a maintainer.
    // The count only changes after merge; a page build never recounts comments.
    if(!mainReport)throw Error("Cannot record an unvalidated feedback comment");
    const path=ledgerPath(code);
    const published=await api("GET","contents/"+path+"?ref="+mainSha,token,undefined,true);
    if(published && published.encoding!=="base64")throw Error("Unexpected reviewed ledger encoding");
    const previous=published ? JSON.parse(Buffer.from(
      published.content.replace(/\s/g,""),"base64").toString("utf8")) : null;
    const updated=addReviewedFeedback(previous,mainReport);
    if(!updated.changed) return {outcome:updated.reason,kind,code};
    await addFile(path,JSON.stringify(updated.ledger,null,2)+"\n");
  }
  // A second user's same-outcome report changes the ledger, even if it does
  // not change catalog status. First reports can update both files atomically.
  if(JSON.stringify(mainCatalog)!==JSON.stringify(current.data)) {
    const record=changedRecord(mainCatalog,current.data,code);
    await addFile(record.path,record.content);
  }
  if(!entriesToCommit.length)throw Error("No reviewed feedback or catalog change to commit");
  const tree=await api("POST","git/trees",token,{base_tree:parent.tree.sha,
    tree:entriesToCommit});
  const commit=await api("POST","git/commits",token,{
    message:"data: review "+code+" community "+kind+" (comment "+commentId+")",
    tree:tree.sha,parents:[mainSha]});
  await api("POST","git/refs",token,{ref:"refs/heads/"+branch,sha:commit.sha});
  const pr=await api("POST","pulls",token,{
    title:"data: review "+code+" "+kind+" from comment #"+commentId,
    head:branch,base:"main",draft:true,maintainer_can_modify:true,
    body:[
      "## Community feedback — requires human review","",
      "Original Issue: #"+issueNumber,
      "Source comment: https://github.com/"+REPO+"/issues/"+issueNumber+"#issuecomment-"+commentId,
      "Reporter: @"+current.reporter,"Code: **"+code+"**",
      "Action: "+current.action,"",
      current.notice||"Self-reported community data, never Muse-verified.","",
      "### Before merging",
      "- [ ] Confirm source, reporter, date, and consistency with newer reports",
      "- [ ] Verify ownership before accepting any quota claim",
      "- [ ] If the original owner report does not explicitly confirm its source, request confirmation from the owner's own Muse invite screen before merge",
      "- [ ] Check CI and preview",
      "- [ ] Review the resulting catalog diff and per-code feedback JSON ledger",
      "",
      "No auto-merge and no automatic Issue closure. The original Issue stays available for discussion."
    ].join("\n")
  });
  await api("POST","issues/"+issueNumber+"/comments",token,{
    body:"<!-- muse-comment-draft-pr:"+commentId+" -->\nPrepared review-only [Draft PR #"+pr.number+"]("+pr.html_url+
      ") for the report on **"+code+"**. A maintainer must approve it before any website status changes."
  });
  try {
    await api("POST","actions/workflows/validate.yml/dispatches",token,{ref:branch});
  } catch(error) {
    console.warn("Validation dispatch needs manual retry: "+error.message);
  }
  console.log("Created Draft PR #"+pr.number+" from comment "+commentId+" on Issue #"+issueNumber);
  return {outcome:"created",number:pr.number,url:pr.html_url,code};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await proposeCommentDraft();
}
