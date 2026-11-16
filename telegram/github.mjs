/* GitHub is the only review queue; Telegram identity never becomes code ownership. */
import { CODE_PATTERN } from "./bot.mjs";

const REPO="ePlus-DEV/muse-invite-hub";
const API="https://api.github.com/repos/"+REPO+"/";
const SITE="https://muse.eplus.dev";

async function request(url, options={}) {
  const response=await fetch(url,{
    ...options,
    headers:{"Accept":"application/vnd.github+json",...options.headers},
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error("Upstream API HTTP "+response.status);
  return response.json();
}
async function github(path,token,method="GET",body) {
  if(!token)throw Error("GitHub Issues credential is not configured");
  return request(API+path,{
    method,
    headers:{
      Authorization:"Bearer "+token,
      "X-GitHub-Api-Version":"2022-11-28",
      ...(body===undefined?{}:{"Content-Type":"application/json"})
    },
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
}
export async function publishedCatalog() {
  const data=await request(SITE+"/data/invites.json");
  if(!Array.isArray(data))throw Error("Invalid published catalog");
  return data.filter(row=>row&&CODE_PATTERN.test(row.code||""));
}
export async function listRecentCodes() {
  const catalog=await publishedCatalog();
  return [...catalog].sort((a,b)=>Number(b.featured===true)-Number(a.featured===true)||
    String(b.addedAt||"").localeCompare(String(a.addedAt||""))).slice(0,6)
    .map(entry=>entry.code);
}

export async function browseCodes({query="",newest=false,limit=5}={}) {
  const catalog=await publishedCatalog();
  const needle=String(query).trim().toLowerCase().slice(0,80);
  return catalog.filter(row=>!needle||
    row.code.toLowerCase().includes(needle)||
    String(row.submittedBy||"").toLowerCase().includes(needle))
    .sort((a,b)=>newest
      ? String(b.addedAt||"").localeCompare(String(a.addedAt||""))
      : Number(b.featured===true)-Number(a.featured===true)||
        String(b.addedAt||"").localeCompare(String(a.addedAt||"")))
    .slice(0,Math.min(10,Math.max(1,limit)))
    .map(row=>{
      const dated=/^\d{4}-\d{2}-\d{2}$/.test(row.usageReportedAt||"");
      const remaining=Number.isSafeInteger(row.reportedRemaining)&&row.reportedRemaining>=0
        ? row.reportedRemaining
        : Number.isSafeInteger(row.reportedCapacity)&&Number.isSafeInteger(row.reportedUses)&&
          row.reportedCapacity>=row.reportedUses&&row.reportedUses>=0
          ? row.reportedCapacity-row.reportedUses : null;
      return {code:row.code,status:row.status,remaining:dated?remaining:null,
        usageReportedAt:dated?row.usageReportedAt:null};
    });
}

export async function getCodeStatus(code,token) {
  if(!CODE_PATTERN.test(code))throw Error("Invalid public invite code");
  const entry=(await publishedCatalog()).find(item=>item.code===code);
  if(entry) {
    const dated=typeof entry.usageReportedAt==="string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.usageReportedAt);
    const explicit=Number.isSafeInteger(entry.reportedRemaining)&&entry.reportedRemaining>=0
      ? entry.reportedRemaining : null;
    const calculated=Number.isSafeInteger(entry.reportedCapacity)&&
      Number.isSafeInteger(entry.reportedUses)&&entry.reportedCapacity>=entry.reportedUses&&
      entry.reportedUses>=0 ? entry.reportedCapacity-entry.reportedUses : null;
    return {kind:"listed",status:entry.status,
      reportedRemaining:dated?(explicit??calculated):null,
      usageReportedAt:dated?entry.usageReportedAt:null,
      url:SITE+"/codes/"+encodeURIComponent(code)+"/"};
  }
  const issue=await findExistingTelegramSubmission(code,token);
  if(issue)return {kind:issue.state==="open"?"pending":"closed",url:issue.html_url};
  return {kind:"unknown",url:SITE+"/#codes"};
}

async function findExistingTelegramSubmission(code,token) {
  // GitHub's /issues collection includes PRs; skip those. Fail closed rather
  // than creating a duplicate when the repo grows beyond our scan budget.
  for(let page=1;page<=20;page++){
    const batch=await github("issues?state=all&per_page=100&page="+page,token);
    const match=batch.find(issue=>{
      if(issue.pull_request)return false;
      const title=String(issue.title||"");
      const body=String(issue.body||"");
      const original=/^### Invite code\s*\r?\n\s*([A-Z0-9]{6})\s*(?:\r?\n|$)/m.exec(body)?.[1];
      const canonical=/<!-- (?:muse-code-feedback-thread:\s*|muse-code-feedback-root:)([A-Z0-9]{6})\s*-->/.exec(body)?.[1];
      return (title==="[Telegram submission] "+code&&body.includes("<!-- muse-telegram-submission:"+code+" -->"))||
        (title.startsWith("[Invite]")&&original===code)||
        (title.startsWith("[Code discussion]")&&canonical===code)||
        (canonical===code);
    });
    if(match)return match;
    if(batch.length<100)return null;
  }
  throw Error("Issue scan exceeded safe pagination limit");
}
export async function submitNewCode(code,updateId,token) {
  if(!CODE_PATTERN.test(code)||!Number.isSafeInteger(updateId))throw Error("Invalid public contribution");
  const existing=(await publishedCatalog()).find(item=>item.code===code);
  if(existing)return {kind:"listed",url:SITE+"/codes/"+encodeURIComponent(code)+"/"};
  const prior=await findExistingTelegramSubmission(code,token);
  if(prior)return {kind:"pending",url:prior.html_url};
  // Deliberately NOT [Invite]: that workflow assumes issue.user is the GitHub
  // owner, but here the actor is the service bot. Human review is mandatory.
  const issue=await github("issues",token,"POST",{
    title:"[Telegram submission] "+code,
    body:[
      "<!-- muse-telegram-submission:"+code+" -->",
      "## New community invite reported via Telegram",
      "",
      "Invite code: **"+code+"**",
      "",
      "This report came from Telegram. The sender's GitHub identity, code ownership,",
      "Muse eligibility, redemption and remaining quota are **not verified**.",
      "",
      "A maintainer must check the code and attribution before opening a",
      "review-only data Draft PR. Do not auto-publish this bot-authored Issue.",
      "",
      "Do not request or publish Telegram usernames, private screenshots or secrets."
    ].join("\n")
  });
  return {kind:"submitted",url:issue.html_url};
}
async function containsCommentMarker(issueNo,marker,token) {
  for(let page=1;page<=20;page++){
    const batch=await github("issues/"+issueNo+"/comments?per_page=100&page="+page,token);
    if(batch.some(item=>item.body?.includes(marker)))return true;
    if(batch.length<100)return false;
  }
  throw Error("Comment scan exceeded safe pagination limit");
}
export async function submitFeedback(code,outcome,updateId,token) {
  if(!CODE_PATTERN.test(code)||!["worked","failed"].includes(outcome)||
      !Number.isSafeInteger(updateId))throw Error("Invalid public feedback");
  const existing=(await publishedCatalog()).find(item=>item.code===code);
  if(!existing)return {kind:"unknown",url:SITE+"/#codes"};
  const mapping=existing.feedbackIssueNumber;
  const number=Number.isSafeInteger(mapping)&&mapping>0 ? mapping : null;
  if(!number)return {kind:"unmapped",url:SITE+"/codes/"+encodeURIComponent(code)+"/"};
  const marker="<!-- muse-telegram-feedback-update:"+updateId+" -->";
  const url="https://github.com/"+REPO+"/issues/"+number;
  if(await containsCommentMarker(number,marker,token))return {kind:"already-reported",url};
  const line=outcome==="worked"?"Muse accepted my code":"Muse rejected or could not redeem my code";
  await github("issues/"+number+"/comments",token,"POST",{
    body:[
      marker,"Code: "+code,"Result: "+line,
      "Source: Telegram community report (anonymous; not verified)",
      "",
      "A user reported this result through Telegram. This bot-authored comment",
      "is for **maintainer review only**. It does not validate redemption,",
      "verify ownership or update the published catalog automatically."
    ].join("\n")
  });
  // Existing bot-comment protections intentionally prevent auto Draft PRs.
  return {kind:"reported",url};
}
