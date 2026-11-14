import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { validateCatalog } from "./validate.mjs";
import { fetchGitHubCatalog, changedRecord, changedRecords } from "./catalog.mjs";
import { parsePublicSource, listedPlatform, LISTING_PLATFORMS } from "./source-platform.mjs";
import { isShareCodeIssue, parseInviteCodes } from "./code-issue-map.mjs";

const REPO = "ePlus-DEV/muse-invite-hub";
const MARKER = "<!-- muse-issue-draft-pr -->";
const CODE_PATTERN = /^[A-Z0-9-]{4,32}$/;
const USER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_OWN = "GitHub (my own code)";
const THREADS_FOUND = "Threads (public code I found)";
const X_FOUND = "X (Twitter) (public code I found)";
const FACEBOOK_FOUND = "Facebook (public code I found)";
const THREADS_FIELD = "Threads public post or profile URL (required for Threads)";
const SOCIAL_FIELD = "Social post or profile URL (required for Threads, X or Facebook)";
const listedPlatformOf = listedPlatform;
const SUBMISSION_PLATFORMS = new Map([
  [GITHUB_OWN, "GitHub"],
  [THREADS_FOUND, "Threads"],
  [X_FOUND, "X (Twitter)"],
  [FACEBOOK_FOUND, "Facebook"]
]);
function threadsReference(value) {
  const social = parsePublicSource(value);
  return social?.platform === "Threads" ? social : null;
}

export function readIssueFields(body) {
  const values = {};
  const sections = String(body ?? "").split(/^### /m).slice(1);
  for (const section of sections) {
    const firstBreak = section.indexOf("\n");
    if (firstBreak < 0) continue;
    const title = section.slice(0, firstBreak).trim();
    const value = section.slice(firstBreak + 1).trim();
    if (!title || Object.hasOwn(values, title)) continue;
    values[title] = !value || value === "_No response_" ? "" : value;
  }
  return values;
}
function field(fields, name) {
  return fields[name] || "";
}
function optionalInteger(value, name, max = 1000) {
  const str = String(value ?? "").trim();
  if (!str) return null;
  if (!/^(?:0|[1-9][0-9]{0,3})$/.test(str)) throw Error(name + " must be a non-negative integer.");
  const n = Number(str);
  if (n > max) throw Error(name + " is outside the supported range.");
  return n;
}
function reportDate(issue) {
  // Submission date is a clearly documented reporting date, not a Muse API timestamp.
  const timestamp = issue.updated_at || issue.created_at;
  const date = new Date(timestamp || "");
  if (!Number.isFinite(date.getTime())) throw Error("Missing Issue report date.");
  return date.toISOString().slice(0, 10);
}
function codesFrom(fields) {
  return parseInviteCodes(field(fields, "Invite code"));
}
function findCode(records, code) {
  return records.find(item => item.code.toUpperCase() === code) || null;
}
// A dated remaining-only owner report must not imply an unknown total.
function remainingFromLegacyNotes(fields, label) {
  const notes = field(fields,label);
  const matches = [...notes.matchAll(/\b(0|[1-9][0-9]{0,3})\s+(?:uses?|invites?)\s+(?:left|remaining)\b/gi)];
  return matches.length === 1 ? optionalInteger(matches[0][1],"Remaining invites") : null;
}
function actualQuota(fields, date, labels) {
  const total = optionalInteger(field(fields, labels.total), "Total invites");
  const used = optionalInteger(field(fields, labels.used), "Used invites");
  let remaining = labels.remaining
    ? optionalInteger(field(fields, labels.remaining), "Remaining invites") : null;
  if (remaining === null && labels.notes) remaining = remainingFromLegacyNotes(fields,labels.notes);
  if (total !== null) {
    if (total === 0) throw Error("Total invite quota must be positive.");
    const count = used !== null ? used : remaining !== null ? total - remaining : null;
    if (count === null) return null;
    if (count < 0 || count > total || (remaining !== null && total - count !== remaining)) {
      throw Error("Reported total, used and remaining figures are inconsistent.");
    }
    return { reportedCapacity: total, reportedUses: count, usageReportedAt: date };
  }
  if (remaining !== null) return { reportedRemaining: remaining, usageReportedAt: date };
  return null;
}
function ownerMatches(existing, issue) {
  if (Number.isSafeInteger(existing.submittedById)) return existing.submittedById === issue.user?.id;
  return String(existing.submittedBy || "").toLowerCase() === issue.user?.login?.toLowerCase();
}
function updateQuota(target, quota, date) {
  if (target.usageReportedAt && target.usageReportedAt > date) return "stale";
  const keys=["reportedCapacity","reportedUses","reportedRemaining","usageReportedAt"];
  if (keys.every(key=>target[key]===quota[key])) return "duplicate";
  for (const key of keys) delete target[key];
  Object.assign(target,quota);
  return "updated";
}
function rememberOwnerId(target,issue) {
  if (Number.isSafeInteger(issue.user?.id) && issue.user.id > 0) target.submittedById=issue.user.id;
}
function summary(issue, code, action) {
  return "Community Issue #" + issue.number + " (" + action + "), code " + code +
    "; maintainer review required, no live redemption verification.";
}

function planMultiInvite(issue, current, codes, fields) {
  const quotas = [
    "Uses so far (optional; self-reported)",
    "Invite limit (optional; self-reported)",
    "Remaining invites (optional; self-reported)"
  ];
  if (quotas.some(name => field(fields, name).trim())) {
    return {outcome:"needs-review",kind:"invite",code:codes.join(", "),
      reason:"For multiple invite codes, leave per-code uses/limit/remaining fields blank; provide separate owner-count updates after publication."};
  }
  const existing = codes.find(code => findCode(current,code));
  if (existing) {
    return {outcome:"needs-review",kind:"invite",code:codes.join(", "),
      reason:"Invite code "+existing+" is already in the catalog. Multi-code Issues must contain only new, distinct codes."};
  }
  const parts = String(issue.body || "").split(/^### /m);
  const index = parts.findIndex(part => /^Invite code\r?\n/.test(part));
  if (index < 0) throw Error("Invite code field is missing.");
  let data = current;
  const notices = [];
  for (const code of codes) {
    const fieldsForCode = [...parts];
    fieldsForCode[index] = "Invite code\n\n"+code+"\n\n";
    const singleIssue = {...issue,body:fieldsForCode.join("### ")};
    const plan = planIssueChange(singleIssue,data);
    if (plan.outcome !== "proposal" || plan.action.startsWith("update")) {
      return {outcome:"needs-review",kind:"invite",code:codes.join(", "),
        reason:"Code "+code+" cannot be submitted automatically: "+
          (plan.reason || "existing or unreviewed code")};
    }
    const item = plan.data.find(entry => entry.code === code);
    if (!item || item.id !== "community-issue-"+issue.number) {
      throw Error("Multi-code record attribution could not be verified.");
    }
    item.id = "community-issue-"+issue.number+"-"+code.toLowerCase();
    item.feedbackIssueNumber = issue.number;
    data = plan.data;
    if (plan.notice) notices.push(code+": "+plan.notice);
  }
  const errors = validateCatalog(data);
  if (errors.length) throw Error("Generated multi-code catalog failed validation: "+errors.join("; "));
  return {
    outcome:"proposal",kind:"invite",code:codes[0],codes,
    action:"add "+codes.length+" codes",data,
    notice:notices.join("\n") || "All codes remain unverified and require human review.",
    branch:"auto/issue-"+issue.number+"-invite",
    summary:summary(issue,codes.join(", "),"add multiple")
  };
}

export function planIssueChange(issue, current) {
  if (!Number.isSafeInteger(issue?.number) || issue.number <= 0) throw Error("Invalid Issue number.");
  if (!Array.isArray(current)) throw Error("Expected a catalog array.");
  if (!USER_PATTERN.test(issue.user?.login || "")) throw Error("Invalid contributor username.");
  const title = String(issue.title || "").trim();
  const kind = title.startsWith("[Count update]") ? "count" :
    title.startsWith("[Code feedback]") ? "feedback" :
    title.startsWith("[Invite]") || isShareCodeIssue(issue) ? "invite" : null;
  if (!kind) return { outcome:"unsupported", reason:"Issue does not use a supported Muse Invite Hub form." };
  const f = readIssueFields(issue.body);
  const codes = codesFrom(f);
  if (kind !== "invite" && codes.length !== 1) {
    throw Error("Count/feedback Issues must reference exactly one Invite code.");
  }
  if (kind === "invite" && codes.length > 1) {
    return planMultiInvite(issue, current, codes, f);
  }
  const code = codes[0];
  const existing = findCode(current, code);
  const date = reportDate(issue);
  const data = structuredClone(current);
  let action, notice = "";
  if (kind === "count" || kind === "feedback") {
    const platform = field(f, "Listing platform").trim();
    // Older Issue Forms had no platform selector. Retain their code-based behavior
    // while enforcing the explicit platform in all new submissions.
    if (platform && !LISTING_PLATFORMS.includes(platform)) {
      return {outcome:"needs-review",kind,code,
        reason:"Listing platform must be GitHub, Threads, X (Twitter) or Facebook."};
    }
    if (existing && platform) {
      const listedPlatform = listedPlatformOf(existing);
      if (platform !== listedPlatform) {
        return {outcome:"needs-review",kind,code,
          reason:"Selected platform does not match the catalog listing (" + listedPlatform +
            "). Same usernames on GitHub and Threads are distinct accounts; select the code's actual source."};
      }
    }
  }
  if (kind === "invite") {
    const checklist = field(f,"Contributor checklist")
      .replace(/-\s*\[X\]/g,"- [x]");
    const authorized = checklist.includes("[x] I am authorized to share this code publicly") ||
      checklist.includes("[x] I own this public code or am reporting a code explicitly shared publicly");
    if (!authorized || !checklist.includes("[x] This code is not a password")) {
      throw Error("Contributor permission and privacy confirmations are required.");
    }
    const selectedSource = field(f,"Code source").trim();
    if (selectedSource && !SUBMISSION_PLATFORMS.has(selectedSource)) {
      return {outcome:"needs-review",kind,code,
        reason:"Choose GitHub, Threads, X (Twitter) or Facebook as the code source."};
    }
    const sourcePlatform = SUBMISSION_PLATFORMS.get(selectedSource) || "GitHub";
    const socialSubmission = sourcePlatform !== "GitHub";
    const urlField = field(f,SOCIAL_FIELD).trim() || field(f,THREADS_FIELD).trim();
    // Legacy issues omitted source selection; never claim public social URLs
    // belong to a GitHub Issue reporter simply because the handles match.
    const legacyUrl = field(f,"Public confirmation or context (optional)").trim();
    if (!selectedSource && parsePublicSource(legacyUrl)) {
      return {outcome:"needs-review",kind,code,
        reason:"Legacy social-source Issues require platform selection and maintainer review."};
    }
    if (!socialSubmission && urlField) {
      return {outcome:"needs-review",kind,code,
        reason:"Choose the matching social code source when supplying a social URL."};
    }
    const social = socialSubmission ? parsePublicSource(urlField) : null;
    if (socialSubmission && (!social || social.platform !== sourcePlatform)) {
      return {outcome:"needs-review",kind,code,
        reason:"Provide an HTTPS public profile or post URL matching the selected social platform."};
    }
    if (socialSubmission && !social.post) {
      return {outcome:"needs-review",kind,code,
        reason:"A social profile alone cannot prove a code was posted. Supply the original public post URL for maintainer review."};
    }
    if (socialSubmission && ["Invite limit (optional; self-reported)",
        "Uses so far (optional; self-reported)",
        "Remaining invites (optional; self-reported)"].some(label => field(f,label).trim())) {
      return {outcome:"needs-review",kind,code,
        reason:"Third-party social reports cannot claim owner-only quota numbers."};
    }
    if (existing) {
      if (socialSubmission || parsePublicSource(existing.sourceUrl)) {
        return {outcome:"needs-review",kind,code,
          reason:"The code is already listed. A cross-platform report cannot replace attribution, ownership or quota automatically."};
      }
      if (!ownerMatches(existing,issue)) {
        return {outcome:"needs-review",kind,code,
          reason:"The code already exists under a different GitHub owner; manual review is required."};
      }
      const quota=actualQuota(f,date,{
        total:"Invite limit (optional; self-reported)",
        used:"Uses so far (optional; self-reported)",
        remaining:"Remaining invites (optional; self-reported)",
        notes:"Notes (optional)"
      });
      if (!quota) return {outcome:"needs-review",kind,code,
        reason:"Owner confirmed, but no complete count or remaining-only value was provided."};
      const target=data.find(item=>item.code===existing.code);
      const state=updateQuota(target,quota,date);
      if(state!=="updated") return {outcome:state==="stale"?"needs-review":"duplicate",kind,code,
        reason:state==="stale"?"Newer usage data is already published.":"The published catalog already has this dated quota."};
      rememberOwnerId(target,issue);
      action="update owner report";
      notice="The GitHub owner updated a dated self-reported count; this is NOT a live Muse balance.";
    } else {
      const id = "community-issue-" + issue.number;
      if (data.some(item => item.id === id)) throw Error("Catalog ID already exists.");
      const entry = {
        id, code, status:"unverified", addedAt:date,
        feedbackIssueNumber:issue.number,
        ...(socialSubmission
          ? {sourceUrl:social.url, note:"Public "+social.platform+" code reported in issue #"+issue.number+
              "; original post and Muse redemption require human review."}
          : {submittedBy:issue.user.login, note:"Community-submitted in issue #"+issue.number+
              "; redemption not independently verified."})
      };
      if (!socialSubmission) {
        rememberOwnerId(entry,issue);
        const reported=actualQuota(f,date,{
          total:"Invite limit (optional; self-reported)",
          used:"Uses so far (optional; self-reported)",
          remaining:"Remaining invites (optional; self-reported)",
          notes:"Notes (optional)"
        });
        if (reported) Object.assign(entry,reported);
        else notice="Usage numbers were absent or incomplete; no available-slot count has been guessed.";
      } else {
        notice=social.platform+" @"+social.handle+" is the cited public source, NOT the GitHub reporter or a verified code owner. "+
          "Verify the original post and code before merging; do NOT invent availability or redemption results.";
      }
      const firstCommunity=data.findIndex(item=>item.featured!==true);
      data.splice(firstCommunity<0?data.length:firstCommunity,0,entry);
      action=socialSubmission?"add "+social.platform+" source":"add";
    }
  } else if (kind === "count") {
    if (!existing) return { outcome:"needs-review",kind,code,reason:"Code not yet in the catalog; report requires manual triage." };
    const confirmation = field(f,"Confirmation");
    if (!confirmation.includes("[x] I confirm that these figures came from a Muse invite screen")) {
      throw Error("The owner must confirm the figures came from their Muse invite screen.");
    }
    if (parsePublicSource(existing.sourceUrl)) {
      return {outcome:"needs-review",kind,code,
        reason:"Social attribution does not prove GitHub ownership. Owner quota updates for social codes require manual verification."};
    }
    if (!ownerMatches(existing,issue)) {
      return { outcome:"needs-review",kind,code,reason:"Only the cataloged code owner may submit a quota proposal automatically." };
    }
    const quota = actualQuota(f,date,{
      total:"Total invite quota shown by Muse (if known)",
      used:"Already used invites (if known)",
      remaining:"Remaining invites shown by Muse"
    });
    if (!quota) return { outcome:"needs-review",kind,code,reason:"Supply remaining invites or a consistent total and used count." };
    const target=data.find(item=>item.code===existing.code);
    const state=updateQuota(target,quota,date);
    if(state!=="updated") return {outcome:state==="stale"?"needs-review":"duplicate",kind,code,
      reason:state==="stale"?"Newer usage data is already published.":"The published catalog already has this dated quota."};
    rememberOwnerId(target,issue);
    action = "update quota";
  } else {
    if (!existing) return {outcome:"needs-review",kind,code,reason:"Code not in the catalog; feedback needs manual review."};
    const reason=field(f,"What happened?");
    const next = reason === "Muse accepted the code (worked for me)" ? "reported-working" :
      reason === "Muse did not accept the code" || reason === "Muse says it is used or exhausted"
        ? "reported-not-working" : null;
    if (!next) return {outcome:"needs-review",kind,code,reason:"Feedback is informational; no automatic status proposal for this reason."};
    const target=data.find(item=>item.code===existing.code);
    if (target.status===next && target.checkedAt===date) {
      return {outcome:"duplicate",kind,code,reason:"The published catalog already has this dated feedback."};
    }
    target.status=next;
    target.checkedAt=date;
    if (target.featured && next==="reported-not-working") {
      return {outcome:"needs-review",kind,code,reason:"Feedback on the featured owner code needs special maintainer review."};
    }
    action="review reported status";
    notice="This is one contributor's report, NOT confirmation by Muse and NOT evidence of global redemption availability.";
  }
  const errs=validateCatalog(data);
  if(errs.length) throw Error("Generated catalog failed validation: "+errs.join("; "));
  return {outcome:"proposal",kind,code,action,data,notice,
    branch:"auto/issue-"+issue.number+"-"+kind,summary:summary(issue,code,action)};
}

const apiRoot="https://api.github.com/repos/"+REPO+"/";
async function api(method,path,token,payload,allow404=false) {
  const response = await fetch(apiRoot+path,{
    method,
    headers:{
      Authorization:"Bearer "+token,
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      ...(payload===undefined?{}:{"Content-Type":"application/json"})
    },
    ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
    signal:AbortSignal.timeout(25000)
  });
  if (allow404 && response.status===404) return null;
  if (!response.ok) {
    const error=await response.text();
    throw Error("GitHub "+method+" "+path+" returned HTTP "+response.status+
      ": "+error.slice(0,350));
  }
  if(response.status===204)return null;
  return response.json();
}
async function comment(issue,token,body) {
  const messages=await api("GET","issues/"+issue.number+"/comments?per_page=100",token);
  const previous=messages.find(entry=>entry.user?.login==="github-actions[bot]"&&
    entry.body?.includes(MARKER));
  const text=MARKER+"\n"+body;
  if(previous){
    await api("PATCH","issues/comments/"+previous.id,token,{body:text});
  } else {
    await api("POST","issues/"+issue.number+"/comments",token,{body:text});
  }
}
async function getCatalog(token,sha){
  return fetchGitHubCatalog((path,allow404=false)=>
    api("GET",path,token,undefined,allow404),sha);
}
async function openBotPrs(token){
  const result=await api("GET","pulls?state=open&per_page=100",token);
  return result.filter(pr=>pr.head?.repo?.full_name===REPO);
}
async function propose(issue,token) {
  if(issue.state!=="open" || issue.pull_request) return {outcome:"skipped",reason:"Issue not open."};
  const ref=await api("GET","git/ref/heads/main",token);
  const mainSHA=ref.object.sha;
  const catalog=await getCatalog(token,mainSHA);
  const proposed=planIssueChange(issue,catalog);
  if(proposed.outcome!=="proposal")return proposed;

  // Multi-code Issues create one Draft PR but independent JSON records.
  // Disallow overlap with other active automated proposals, even when those
  // proposals contain multiple codes.
  const codes=proposed.codes || [proposed.code];
  const codesLabel=codes.join(", ");
  const prs=await openBotPrs(token);
  const matching=prs.find(pr=>pr.head.ref===proposed.branch);
  if(matching)return {outcome:"already-open",url:matching.html_url,code:codesLabel};
  for (const pr of prs.filter(pr=>pr.head.ref.startsWith("auto/"))) {
    const title=/^data: review (.+) (?:invite|count|feedback) \(issue #[1-9][0-9]*\)$/.exec(String(pr.title || ""));
    const listed=title ? title[1].split(", ") : [];
    if (codes.some(code=>listed.includes(code))) {
      return {outcome:"needs-review",code:codesLabel,
        reason:"Another open automated PR already changes one of these codes: "+pr.html_url};
    }
  }

  // Never overwrite an existing branch. A branch left behind after a
  // repository-level PR permission denial can be retried without rewriting it.
  const encoded=proposed.branch.split("/").map(encodeURIComponent).join("/");
  const existing=await api("GET","git/ref/heads/"+encoded,token,undefined,true);
  if(existing){
    const prepared=await getCatalog(token,existing.object.sha);
    if(codes.some(code=>JSON.stringify(prepared.find(x=>x.code===code)) !==
       JSON.stringify(proposed.data.find(x=>x.code===code)))){
      return {outcome:"needs-review",code:proposed.code,
        reason:"An older automation branch exists with different data. A maintainer must reconcile it; the bot will not overwrite history."};
    }
  }
  if (!existing) {
    // The branch tree is sourced from the exact current trusted main commit.
    const base=await api("GET","git/commits/"+mainSHA,token);
    const records=codes.length===1
      ? [changedRecord(catalog,proposed.data,proposed.code)]
      : changedRecords(catalog,proposed.data,codes);
    const entries=[];
    for (const record of records) {
      const blob=await api("POST","git/blobs",token,{content:record.content,encoding:"utf-8"});
      entries.push({path:record.path,mode:"100644",type:"blob",sha:blob.sha});
    }
    const tree=await api("POST","git/trees",token,{
      base_tree:base.tree.sha,
      tree:entries
    });
    const commit=await api("POST","git/commits",token,{
      message:"data: "+proposed.action+" "+codesLabel+" (issue #"+issue.number+")",
      tree:tree.sha,parents:[mainSHA]
    });
    await api("POST","git/refs",token,{ref:"refs/heads/"+proposed.branch,sha:commit.sha});
  }
  const title="data: review "+codesLabel+" "+proposed.kind+" (issue #"+issue.number+")";
  const body=[
    "## Automated draft proposal",
    "",
    "Prepared from public Issue #"+issue.number+" by @"+issue.user.login+".",
    (codes.length===1?"Code: **":"Codes: **")+codesLabel+"**. Change: **"+proposed.action+"**.",
    "",
    proposed.notice || "All published figures remain dated community/owner reports, never live Muse availability.",
    "",
    "### Required human checks",
    "- [ ] Verify the submitter, code and any ownership or usage claims",
    proposed.action.startsWith("add ") && proposed.action.endsWith(" source")
      ? "- [ ] Open the original public social post and confirm it contains this code and matches the attributed account"
      : "- [ ] Confirm the original GitHub owner attribution and any account-reported quota",
    "- [ ] Review catalog diff, duplicates and contributor attribution",
    "- [ ] CI and security checks pass",
    "- [ ] Confirm website preview after marking the draft ready",
    "",
    "**Do not auto-merge**. This is not Muse redemption verification.",
    "",
    "Tracks Issue #"+issue.number+". The Issue is closed only after the reviewed change is merged, live, and a detail link has been posted."
  ].join("\n");
  let pr;
  try {
    pr=await api("POST","pulls",token,{
      title,head:proposed.branch,base:"main",body,draft:true,
      maintainer_can_modify:true
    });
  } catch(error){
    if(/HTTP 403/.test(error.message)){
      await comment(issue,token,"⚠️ A dedicated branch was prepared for **"+proposed.code+
        "**, but GitHub blocked automatic PR creation (HTTP 403). An admin must enable "+
        "**Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** "+
        "then rerun the Issue workflow for #"+issue.number+". No website content was published.");
      return {outcome:"blocked",reason:error.message};
    }
    throw error;
  }
  await comment(issue,token,"Created [Draft PR #"+pr.number+"]("+pr.html_url+
    ") for **"+codesLabel+"**. It needs maintainer review; no website data has been published.");
  // Explicitly dispatch validation on the generated branch. GITHUB_TOKEN PR
  // activity does not reliably start an ordinary CI workflow automatically.
  try {
    await api("POST","actions/workflows/validate.yml/dispatches",token,{ref:proposed.branch});
  } catch(error) {
    await comment(issue,token,"Created [Draft PR #"+pr.number+"]("+pr.html_url+
      ") for **"+codesLabel+"**, but explicit validation dispatch failed: "+
      error.message.slice(0,220)+". A maintainer must run CI before review.");
  }
  return {outcome:"created",url:pr.html_url,number:pr.number,code:codesLabel};
}
export async function runIssueAutomation({
  number, token=process.env.GH_TOKEN, repository=process.env.GITHUB_REPOSITORY
}={}) {
  if(repository!==REPO)throw Error("Unexpected repository; refusing write actions.");
  if(!token)throw Error("Missing GitHub Actions token.");
  if(!Number.isSafeInteger(number)||number<=0)throw Error("Missing valid Issue number.");
  const issue=await api("GET","issues/"+number,token);
  try{
    const result=await propose(issue,token);
    console.log(JSON.stringify(result));
    if(result.outcome==="needs-review"||result.outcome==="duplicate"){
      await comment(issue,token,"No automatic Draft PR was created for this Issue: "+
        result.reason+". A maintainer can review the report manually. No change has been published.");
    }
    if(result.outcome==="already-open"){
      await comment(issue,token,"A [Draft PR]("+result.url+") already exists for this Issue. "+
        "Review the existing proposal; no duplicate branch was created.");
    }
    if(result.outcome==="blocked")process.exitCode=1;
    if(result.outcome!=="created")console.log("No new PR created: "+(result.reason||result.outcome));
    return result;
  } catch(error){
    console.error("Issue #"+number+" could not be proposed: "+error.message);
    if(issue.state==="open"){
      try{
        await comment(issue,token,"⚠️ Draft PR automation could not prepare a safe change: "+
          error.message.slice(0,250)+". Edit the Issue form and retry, or request maintainer review. "+
          "No catalog change was published.");
      }catch(e){console.error("Could not post Issue feedback: "+e.message);}
    }
    throw error;
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const n=Number(process.env.ISSUE_NUMBER);
  await runIssueAutomation({number:n});
}
