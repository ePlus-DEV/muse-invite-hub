/* Issue-comment -> review-only Draft PR. Never treat a public comment as Muse verification.
 * Only a human-submitted, strictly formatted comment on the single mapped Issue is eligible.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { planIssueChange } from "./issue-to-pr.mjs";
import { feedbackCodeForIssue } from "./reopen-code-feedback.mjs";
import { REPO } from "./code-issue-map.mjs";
import { listedPlatform } from "./source-platform.mjs";

const CODE = /^[A-Z0-9-]{4,32}$/;
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

// This parser never promotes an informal conversation into a verified report.
export function planCommentProposal(issue, comment, catalog) {
  if (!Array.isArray(catalog) || typeof comment?.body !== "string" ||
      comment.body.length > MAX_COMMENT || !comment.user?.login ||
      comment.user?.type === "Bot" || comment.user?.login.endsWith("[bot]") ||
      !Number.isSafeInteger(comment.id) || comment.id <= 0) return {outcome:"ignored"};
  const code = feedbackCodeForIssue(issue,catalog);
  if (!code) return {outcome:"ignored"};
  const fields = lines(comment.body);
  if (fields.Code !== code) return {outcome:"ignored"};
  const item = catalog.find(entry=>entry.code===code);
  if (!item) return {outcome:"ignored"};
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

export async function proposeCommentDraft({
  repository=process.env.GITHUB_REPOSITORY,
  token=process.env.GH_TOKEN,
  issueNumber=Number(process.env.ISSUE_NUMBER),
  commentId=Number(process.env.COMMENT_ID),
  catalog
}={}) {
  if(repository!==REPO || !token || !Number.isSafeInteger(issueNumber)||issueNumber<=0||
    !Number.isSafeInteger(commentId)||commentId<=0) throw Error("Trusted repository, token and comment IDs required.");
  const entries=catalog??JSON.parse(readFileSync(new URL("../data/invites.json",import.meta.url),"utf8"));
  const [issue,comment]=await Promise.all([
    api("GET","issues/"+issueNumber,token),
    api("GET","issues/comments/"+commentId,token)
  ]);
  if(comment.issue_url?.split("/").at(-1)!==String(issueNumber) || issue.pull_request) {
    return {outcome:"ignored",reason:"Comment does not belong to a canonical Issue"};
  }
  const planned=planCommentProposal(issue,comment,entries);
  if(planned.outcome!=="proposal") {
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
  const baseContent=await api("GET","contents/data/invites.json?ref="+mainSha,token);
  if(baseContent.encoding!=="base64")throw Error("Unexpected main catalog encoding");
  const mainCatalog=JSON.parse(Buffer.from(baseContent.content.replace(/\s/g,""),"base64").toString("utf8"));
  const current=planCommentProposal(issue,comment,mainCatalog);
  if(current.outcome!=="proposal")return current;
  // Independent branches from main only; never stack on an unmerged PR.
  for(const pr of own) {
    if(!pr.head.ref.startsWith("auto/"))continue;
    const candidate=await api("GET","contents/data/invites.json?ref="+encodeURIComponent(pr.head.sha),token,undefined,true);
    if(!candidate||candidate.encoding!=="base64")continue;
    const diff=JSON.parse(Buffer.from(candidate.content.replace(/\s/g,""),"base64").toString("utf8"));
    const from=mainCatalog.find(item=>item.code===code);
    const proposedItem=diff.find(item=>item.code===code);
    if(JSON.stringify(from)!==JSON.stringify(proposedItem)) {
      return {outcome:"needs-review",code,kind,reason:"A Draft PR already changes this code: "+pr.html_url};
    }
  }
  // Existing leftover branches are never modified. Repeated event delivery is idempotent.
  const existingBranch=await api("GET","git/ref/heads/"+branch.split("/").map(encodeURIComponent).join("/"),token,undefined,true);
  if(existingBranch)return {outcome:"needs-review",code,reason:"Previous proposal branch exists; review before retry: "+branch};
  const parent=await api("GET","git/commits/"+mainSha,token);
  const blob=await api("POST","git/blobs",token,{
    content:JSON.stringify(current.data,null,2)+"\n",encoding:"utf-8"
  });
  const tree=await api("POST","git/trees",token,{base_tree:parent.tree.sha,
    tree:[{path:"data/invites.json",mode:"100644",type:"blob",sha:blob.sha}]});
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
      "- [ ] Check CI and preview",
      "- [ ] Review the resulting catalog diff",
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
