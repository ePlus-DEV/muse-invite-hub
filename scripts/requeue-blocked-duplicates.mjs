/* Requeue stale duplicate Issue reports only after a trusted Pages deploy.
 * The existing Issue-to-PR automation owns all duplicate/attribution checks
 * and decides whether to comment/close. This script never publishes records.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readCatalog } from "./catalog.mjs";
import { hasRequiredInviteConfirmations, readIssueFields } from "./issue-to-pr.mjs";
import { isShareCodeIssue, issueCodes, originalIssueNumber } from "./code-issue-map.mjs";

const REPO="ePlus-DEV/muse-invite-hub";
const SHA=/^[a-f0-9]{40}$/;
const BOT_MARKER="<!-- muse-issue-draft-pr -->";
const BLOCKED=/Another open automated PR already changes one of these codes: https:\/\/github\.com\/ePlus-DEV\/muse-invite-hub\/pull\/[1-9][0-9]*/;
const BOT_USERS=new Set(["eplus-bot","github-actions[bot]"]);

export function retryableDuplicate(issue,records){
  if(!issue || issue.pull_request || issue.state!=="open" ||
      !Number.isSafeInteger(issue.number) || issue.number<=0 ||
      !isShareCodeIssue(issue) || !hasRequiredInviteConfirmations(issue.body) ||
      !Array.isArray(records)) return null;
  const codes=issueCodes(issue);
  if(codes.length!==1)return null;
  const f=readIssueFields(issue.body);
  // Only requeue the previously blocked GitHub Issue route. A competing
  // ownership/quota claim or a changed source must receive human review.
  if(f["Code source"]!=="GitHub (my own code)")return null;
  if(["Invite limit (optional; self-reported)",
      "Uses so far (optional; self-reported)",
      "Remaining invites (optional; self-reported)",
      "Social post or profile URL (required for Threads, X or Facebook)",
      "Threads public post or profile URL (required for Threads)",
      "Public confirmation or context (optional)"].some(key=>Boolean(f[key])))return null;
  const canonical=records.find(item=>item.code===codes[0]);
  const original=originalIssueNumber(canonical);
  if(!canonical || !Number.isSafeInteger(original) ||
      original<=0 || original===issue.number)return null;
  return {issueNumber:issue.number,code:codes[0],original};
}

export function wasBlockedByOverlappingPr(comments){
  return Array.isArray(comments) && comments.some(entry=>
    BOT_USERS.has(entry.user?.login) &&
    String(entry.body||"").includes(BOT_MARKER) &&
    BLOCKED.test(String(entry.body||"")));
}

async function github(request,token,method,path,body){
  const response=await request("https://api.github.com/repos/"+REPO+"/"+path,{
    method,
    headers:{
      Accept:"application/vnd.github+json",
      Authorization:"Bearer "+token,
      "X-GitHub-Api-Version":"2022-11-28",
      ...(body===undefined?{}:{"Content-Type":"application/json"})
    },
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(25000)
  });
  if(!response.ok)throw Error("GitHub "+method+" "+path+": HTTP "+response.status);
  return response.status===204?null:response.json();
}

export async function requeueBlockedDuplicates({
  token,repository=REPO,deployedSha,request=fetch,records=readCatalog(),
  maxDispatch=8
}={}){
  if(repository!==REPO || !token || !SHA.test(deployedSha||"") ||
     !Array.isArray(records) || !Number.isSafeInteger(maxDispatch) ||
     maxDispatch<1 || maxDispatch>20)throw Error("Trusted deployed repo, SHA, catalog and token required");
  const summary={scanned:0,eligible:0,dispatched:0};
  for(let page=1;page<=5;page++){
    const issues=await github(request,token,"GET",
      "issues?state=open&sort=created&direction=desc&per_page=100&page="+page);
    if(!Array.isArray(issues))throw Error("Expected open Issues list");
    for(const issue of issues){
      summary.scanned++;
      const possible=retryableDuplicate(issue,records);
      if(!possible)continue;
      const comments=await github(request,token,"GET",
        "issues/"+possible.issueNumber+"/comments?per_page=100");
      if(!wasBlockedByOverlappingPr(comments))continue;
      summary.eligible++;
      // Dispatch to the existing trusted workflow, which rechecks the
      // live detail URL, original discussion and source before closing.
      await github(request,token,"POST",
        "actions/workflows/issue-to-pr.yml/dispatches",{
          ref:"main",inputs:{issue_number:String(possible.issueNumber)}
        });
      summary.dispatched++;
      if(summary.dispatched===maxDispatch){
        console.log("Reached bounded duplicate retry limit; remaining Issues await a later deploy.");
        return summary;
      }
    }
    if(issues.length<100)break;
  }
  console.log("Requeued stale duplicate Issues: "+JSON.stringify(summary));
  return summary;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    await requeueBlockedDuplicates({
      token:process.env.GH_TOKEN,
      repository:process.env.GITHUB_REPOSITORY,
      deployedSha:process.env.DEPLOYED_SHA
    });
  }catch(error){
    console.error("::error::Could not requeue blocked duplicate Issues: "+error.message);
    process.exitCode=1;
  }
}
