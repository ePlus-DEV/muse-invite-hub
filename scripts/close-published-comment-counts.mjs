/* Trusted main-only post-deployment reconciliation for owner quota comment PRs.
 * Comment-origin PRs are reviewed manually; this script never approves or merges.
 * Never close a canonical Issue for an unreviewed or newer community report.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readCatalog, recordPath } from "./catalog.mjs";
import { issueCodes } from "./code-issue-map.mjs";
import { unrelatedReferralCode } from "./reopen-code-feedback.mjs";

const REPO = "ePlus-DEV/muse-invite-hub";
const ORIGIN = "https://muse.eplus.dev";
const SHA = /^[a-f0-9]{40}$/;
const BOT_LOGINS = new Set(["github-actions[bot]", "eplus-bot"]);
const PUBLISHED = "<!-- muse-published-comment-pr:";

// Prefer explicit provenance rather than assuming all reviewed contributions
// must have been created by the Issue-comment bot. Manual owner-count review
// PRs are also valid after merge, but only with two matching source references.
export function commentCountCandidate(pr) {
  if (!pr?.merged_at || !SHA.test(pr.merge_commit_sha || "") ||
      pr.head?.repo?.full_name !== REPO || pr.base?.ref !== "main") return null;
  const auto = /^auto\/comment-([1-9]\d*)-([1-9]\d*)-count$/.exec(pr.head?.ref || "");
  if (auto) {
    if (!BOT_LOGINS.has(pr.user?.login)) return null;
    const issueNumber=Number(auto[1]), commentId=Number(auto[2]);
    if (!Number.isSafeInteger(issueNumber) || !Number.isSafeInteger(commentId)) return null;
    const code = /^Code: \*\*([A-Z0-9]{6})\*\*$/m.exec(pr.body || "")?.[1];
    const action = /^Action: (update quota|review owner-reported count)$/m.exec(pr.body || "")?.[1];
    if (!code || !action ||
        pr.title !== "data: review "+code+" count from comment #"+commentId ||
        !(pr.body || "").includes("Original Issue: #"+issueNumber+"\n") ||
        !(pr.body || "").includes("Source comment: https://github.com/"+REPO+
          "/issues/"+issueNumber+"#issuecomment-"+commentId+"\n")) return null;
    return {issueNumber,commentId,code,prNumber:pr.number,
      mergeSha:pr.merge_commit_sha,provenance:"auto",
      allowNarrative:action==="review owner-reported count"};
  }

  // A contributor's manual count-review PR (e.g. #220) does not use the bot's
  // branch or title. The trusted maintainer must have authored and merged a
  // PR that names both the canonical Issue and the original comment.
  const title=/^data: review ([A-Z0-9]{6}) owner count from issue #([1-9]\d*)(?: \([^\n]*\))?$/.exec(pr.title || "");
  if (!title || pr.user?.login !== "hoangsvit") return null;
  const code=title[1], issueNumber=Number(title[2]);
  const body=String(pr.body || "");
  const links=[...body.matchAll(/https:\/\/github\.com\/ePlus-DEV\/muse-invite-hub\/issues\/([1-9]\d*)#issuecomment-([1-9]\d*)/g)];
  if (links.length !== 1 || Number(links[0][1]) !== issueNumber) return null;
  const commentId=Number(links[0][2]);
  if (!Number.isSafeInteger(issueNumber) || !Number.isSafeInteger(commentId) ||
      !body.includes("Tracks Issue #"+issueNumber+" and comment #"+commentId+".") ||
      !body.includes("Existing invite code: **"+code+"**.")) return null;
  return {issueNumber,commentId,code,prNumber:pr.number,
    mergeSha:pr.merge_commit_sha,provenance:"maintainer",allowNarrative:true};
}

function fieldsFromComment(body) {
  const fields=Object.create(null);
  for (const line of String(body||"").split(/\r?\n/)) {
    const match=/^([A-Za-z][A-Za-z ]{1,48}):\s*(.*)$/.exec(line.trim());
    if (match) {
      if (Object.hasOwn(fields,match[1])) return null;
      fields[match[1]]=match[2].trim();
    }
  }
  return fields;
}

function optionalCount(value) {
  if (value===undefined || value==="") return null;
  if (!/^(0|[1-9]\d{0,3})$/.test(value)) return NaN;
  return Number(value);
}

// The structured form requires the explicit owner's Muse-screen confirmation.
// The separate narrative format is accepted ONLY after a reviewed PR is merged;
// its numbers stay labelled owner-reported and never become Muse-verified.
export function matchesPublishedQuota(comment,record,{allowNarrative=false}={}) {
  if (!comment || !record || comment.user?.login !== record.submittedBy ||
      (record.submittedById && comment.user?.id !== record.submittedById) ||
      !/^\d{4}-\d{2}-\d{2}T/.test(comment.created_at||"") ||
      record.usageReportedAt !== comment.created_at.slice(0,10)) return false;
  const f=fieldsFromComment(comment.body);
  if (!f) return false;
  if (f.Code===record.code && f["Update type"]==="Owner count" &&
      f["Owner confirmation"]==="I confirm these figures came from my own Muse invite screen.") {
    const remaining=optionalCount(f["Remaining invites"]);
    const capacity=optionalCount(f["Total invites"]);
    const uses=optionalCount(f["Used invites"]);
    if ([remaining,capacity,uses].some(value=>Number.isNaN(value))) return false;
    if (Number.isInteger(record.reportedCapacity) && Number.isInteger(record.reportedUses) &&
        record.reportedCapacity > 0 && record.reportedUses >= 0 &&
        record.reportedUses <= record.reportedCapacity) {
      if (capacity===null && uses===null && remaining===null) return false;
      return (capacity===null || capacity===record.reportedCapacity) &&
        (uses===null || uses===record.reportedUses) &&
        (remaining===null || remaining===record.reportedCapacity-record.reportedUses) &&
        ((capacity!==null && uses!==null) || (remaining!==null && (capacity!==null || uses!==null)));
    }
    return Number.isInteger(record.reportedRemaining) && remaining!==null &&
      record.reportedRemaining===remaining && capacity===null && uses===null;
  }

  if (!allowNarrative || !Number.isInteger(record.reportedCapacity) ||
      !Number.isInteger(record.reportedUses) || record.reportedCapacity <= 0 ||
      record.reportedUses < 0 || record.reportedUses > record.reportedCapacity) return false;
  const lines=String(comment.body||"").trim().split(/\r?\n/).map(line=>line.trim());
  const heading=/^Owner count update\s*[—–:-]\s*([A-Z0-9]{6})\s*$/i.exec(lines[0] || "");
  if (!heading || heading[1].toUpperCase()!==record.code ||
      !lines.slice(1).some(line=>/^I am the owner of this invite code\b/i.test(line))) return false;
  const counts=new Map();
  for (const line of lines.slice(1)) {
    const match=/^(?:[-*]\s*)?(Total invites|Remaining invites|Used invites):\s*(.+)$/i.exec(line);
    if (!match) continue;
    const key=match[1].toLowerCase();
    if (counts.has(key) || !/^(?:0|[1-9]\d{0,3})$/.test(match[2])) return false;
    const value=Number(match[2]);
    if (value>1000) return false;
    counts.set(key,value);
  }
  if (!["total invites","remaining invites","used invites"].every(key=>counts.has(key))) return false;
  const total=counts.get("total invites"), used=counts.get("used invites");
  const remaining=counts.get("remaining invites");
  return total===record.reportedCapacity && used===record.reportedUses &&
    remaining===total-used;
}

const QUOTA_FIELDS=["reportedCapacity","reportedUses","reportedRemaining","usageReportedAt"];
export function sameQuota(a,b) {
  return Boolean(a && b && a.code===b.code && a.id===b.id &&
    QUOTA_FIELDS.every(key=>a[key]===b[key]));
}

function apiRequest(request,token) {
  return async (method,path,body) => {
    const response=await request("https://api.github.com/repos/"+REPO+"/"+path,{
      method,
      headers:{
        Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28",
        ...(body===undefined?{}:{"Content-Type":"application/json"})
      },
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      signal:AbortSignal.timeout(25000)
    });
    if (!response.ok) throw Error("GitHub "+method+" "+path+": HTTP "+response.status);
    return response.status===204 ? null : response.json();
  };
}

async function allComments(api,number) {
  const result=[];
  for(let page=1;page<=10;page++){
    const batch=await api("GET","issues/"+number+"/comments?per_page=100&page="+page);
    result.push(...batch);
    if(batch.length<100) return result;
  }
  throw Error("Too many comments to safely reconcile Issue #"+number);
}

async function liveQuotaReady(request,record) {
  const path=ORIGIN+"/codes/"+record.code+"/";
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const [page,json]=await Promise.all([
        request(path+"?published-check="+attempt,{cache:"no-store",signal:AbortSignal.timeout(12000)}),
        request(ORIGIN+"/data/invites.json?published-check="+attempt,
          {cache:"no-store",signal:AbortSignal.timeout(12000)})
      ]);
      if (!page.ok || !json.ok) continue;
      const html=await page.text();
      if (!html.includes("<title>"+record.code+" Muse Invite Code | Muse Invite Hub</title>") ||
          !html.includes('rel="canonical" href="'+path+'"') ||
          html.includes('name="robots" content="noindex')) continue;
      const catalog=await json.json();
      if (Array.isArray(catalog) && sameQuota(catalog.find(x=>x.code===record.code),record)) return true;
    } catch { /* Fail closed on missing or stale public content. */ }
  }
  return false;
}

export async function closePublishedCommentCounts({
  token, deployedSha, repository=REPO, request=fetch, catalog, mapping
}={}) {
  if(repository!==REPO || !token || !SHA.test(deployedSha||"")) {
    throw Error("Trusted repository, token and exact deployed SHA required.");
  }
  const records=catalog??readCatalog();
  const roots=mapping??JSON.parse(readFileSync(new URL("../data/code-issues.json",import.meta.url),"utf8"));
  if(!Array.isArray(records) || !roots || typeof roots!=="object" || Array.isArray(roots)) {
    throw Error("Invalid published catalog or canonical Issue map.");
  }
  const api=apiRequest(request,token);
  const summary={notified:0,closed:0,pending:0,skipped:0};
  const seen=new Set();
  for(let page=1;page<=5;page++){
    const prs=await api("GET","pulls?state=closed&sort=updated&direction=desc&per_page=100&page="+page);
    for(const pr of prs){
      const candidate=commentCountCandidate(pr);
      if(!candidate || seen.has(candidate.issueNumber)) continue;
      // Do not discard a newer PR when an older updated PR has a stale count.
      const {issueNumber,commentId,code,prNumber,mergeSha}=candidate;
      const item=records.find(row=>row.code===code);
      if(!item || roots[code]!==issueNumber ||
          (item.feedbackIssueNumber && item.feedbackIssueNumber!==issueNumber)) {
        summary.pending++; continue;
      }
      const issue=await api("GET","issues/"+issueNumber);
      if(issue.state!=="open" || issue.pull_request) {summary.skipped++;seen.add(issueNumber);continue;}
      // The canonical thread may be a legacy count Issue without the code in its title.
      if(!String(issue.body||"").includes(code)) {summary.pending++;continue;}
      const source=await api("GET","issues/comments/"+commentId);
      if(source.issue_url!=="https://api.github.com/repos/"+REPO+"/issues/"+issueNumber ||
          !matchesPublishedQuota(source,item,{allowNarrative:candidate.allowNarrative}) ||
          !(candidate.provenance==="maintainer"
            ? (pr.body||"").includes("[@"+source.user.login+"'s comment](")
            : (pr.body||"").includes("Reporter: @"+source.user.login+"\n"))) {
        summary.pending++;continue;
      }
      const comments=await allComments(api,issueNumber);
      const canonicalCodes=issueCodes(issue);
      let pendingFeedback=false;
      for (const row of comments) {
        if (row.id<=commentId || BOT_LOGINS.has(row.user?.login) ||
            row.user?.type==="Bot" || !String(row.body||"").trim()) continue;
        // An earlier human-authored completion note for THIS reviewed PR is
        // not new feedback. This marker is specific and never general-purpose.
        if (row.user?.login==="hoangsvit" &&
            String(row.body).startsWith("<!-- muse-manual-published-owner-count:"+prNumber+" -->") &&
            String(row.body).includes("**Code:** "+code) &&
            String(row.body).includes("[PR #"+prNumber+"]")) continue;
        const unrelated=unrelatedReferralCode(row.body,canonicalCodes);
        if (unrelated) {
          // Do not silently discard a different invite pasted into this Issue:
          // point the contributor to the proper Issue Form. Without their
          // consent checkboxes, never create or publish a new code on behalf
          // of the commenter. A failed guidance comment blocks closure.
          const marker="<!-- muse-unrelated-referral:"+row.id+" -->";
          if (!comments.some(entry=>BOT_LOGINS.has(entry.user?.login) &&
              String(entry.body||"").includes(marker))) {
            await api("POST","issues/"+issueNumber+"/comments",{body:marker+"\n"+
              "ℹ️ **"+unrelated+"** is a different invite code and not feedback "+
              "for **"+code+"**. Submit it using the [Share Code Issue Form]("+
              "https://github.com/"+REPO+"/issues/new?template=share-code.yml"+
              ") and check the required ownership/privacy confirmations. "+
              "No new invite was published from this comment."});
          }
          continue;
        }
        pendingFeedback=true;
      }
      if (pendingFeedback) {summary.pending++;continue;}
      const files=await api("GET","pulls/"+prNumber+"/files?per_page=100");
      const path=recordPath(item);
      if(files.length!==1 || files[0].filename!==path || files[0].status==="removed") {
        summary.pending++;continue;
      }
      const comparison=await api("GET","compare/"+mergeSha+"..."+deployedSha);
      if(!["identical","ahead"].includes(comparison.status)) {summary.pending++;continue;}
      const committed=await api("GET","contents/"+path+"?ref="+mergeSha);
      if(committed.encoding!=="base64") {summary.pending++;continue;}
      let mergedRecord;
      try {mergedRecord=JSON.parse(Buffer.from(committed.content.replace(/\s/g,""),"base64").toString("utf8"));}
      catch {summary.pending++;continue;}
      if(!sameQuota(mergedRecord,item) || !await liveQuotaReady(request,item)) {
        summary.pending++;continue;
      }
      // A PR-specific marker allows retry after a comment succeeds but closing fails.
      const marker=PUBLISHED+prNumber+" -->";
      if(!comments.some(row=>BOT_LOGINS.has(row.user?.login) &&
          String(row.body||"").includes(marker))) {
        await api("POST","issues/"+issueNumber+"/comments",{body:[
          marker,"✅ **Reviewed owner count published.**","",
          "**Code:** "+code,
          "**Reported remaining:** "+
            (item.reportedRemaining??item.reportedCapacity-item.reportedUses),
          "**Snapshot date:** "+item.usageReportedAt,
          "**Published detail:** "+ORIGIN+"/codes/"+code+"/",
          "**Merged PR:** #"+prNumber,"",
          "These are owner-reported figures, **not live Muse availability**.",
          "Closing this completed report; new human feedback can reopen the canonical Issue."
        ].join("\n")});
        summary.notified++;
      }
      await api("PATCH","issues/"+issueNumber,{state:"closed",state_reason:"completed"});
      summary.closed++;
      seen.add(issueNumber);
    }
    if(prs.length<100)break;
  }
  console.log("Published owner-count comments: "+JSON.stringify(summary));
  return summary;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    await closePublishedCommentCounts({
      token:process.env.GH_TOKEN,deployedSha:process.env.DEPLOYED_SHA,
      repository:process.env.GITHUB_REPOSITORY
    });
  } catch(error) {
    console.error("::error::Could not close published owner-count comments: "+error.message);
    process.exitCode=1;
  }
}
