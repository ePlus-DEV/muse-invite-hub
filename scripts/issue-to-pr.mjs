import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { validateCatalog } from "./validate.mjs";

const REPO = "ePlus-DEV/muse-invite-hub";
const MARKER = "<!-- muse-issue-draft-pr -->";
const CODE_PATTERN = /^[A-Z0-9-]{4,32}$/;
const USER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

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
function codeFrom(fields) {
  const code = field(fields, "Invite code").trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw Error("Invite code must be 4–32 uppercase letters, numbers or hyphens.");
  return code;
}
function findCode(records, code) {
  return records.find(item => item.code.toUpperCase() === code) || null;
}
function actualQuota(fields, date, labels) {
  const total = optionalInteger(field(fields, labels.total), "Total invites");
  const used = optionalInteger(field(fields, labels.used), "Used invites");
  const remaining = labels.remaining
    ? optionalInteger(field(fields, labels.remaining), "Remaining invites") : null;
  if (total === null) return null;
  if (total === 0) throw Error("Total invite quota must be positive.");
  const count = used !== null ? used : remaining !== null ? total - remaining : null;
  if (count === null) return null;
  if (count < 0 || count > total || (remaining !== null && total - count !== remaining)) {
    throw Error("Reported total, used and remaining figures are inconsistent.");
  }
  return { reportedCapacity: total, reportedUses: count, usageReportedAt: date };
}
function summary(issue, code, action) {
  return "Community Issue #" + issue.number + " (" + action + "), code " + code +
    "; maintainer review required, no live redemption verification.";
}
export function planIssueChange(issue, current) {
  if (!Number.isSafeInteger(issue?.number) || issue.number <= 0) throw Error("Invalid Issue number.");
  if (!Array.isArray(current)) throw Error("Expected a catalog array.");
  if (!USER_PATTERN.test(issue.user?.login || "")) throw Error("Invalid contributor username.");
  const title = String(issue.title || "").trim();
  const kind = title.startsWith("[Invite]") ? "invite" :
    title.startsWith("[Count update]") ? "count" :
    title.startsWith("[Code feedback]") ? "feedback" : null;
  if (!kind) return { outcome:"unsupported", reason:"Issue does not use a supported Muse Invite Hub form." };
  const f = readIssueFields(issue.body);
  const code = codeFrom(f);
  const existing = findCode(current, code);
  const date = reportDate(issue);
  const data = structuredClone(current);
  let action, notice = "";
  if (kind === "invite") {
    const checklist = field(f,"Contributor checklist");
    if (!checklist.includes("[x] I am authorized to share this code publicly") ||
        !checklist.includes("[x] This code is not a password")) {
      throw Error("Contributor permission and privacy confirmations are required.");
    }
    if (existing) return { outcome:"duplicate", kind, code, reason:"This code is already in the published catalog." };
    const id = "community-issue-" + issue.number;
    if (data.some(item => item.id === id)) throw Error("Catalog ID already exists.");
    const entry = {
      id, code, status:"unverified", addedAt:date,
      submittedBy:issue.user.login,
      note:"Community-submitted in issue #" + issue.number + "; redemption not independently verified."
    };
    const reported = actualQuota(f,date,{
      total:"Invite limit (optional; self-reported)",
      used:"Uses so far (optional; self-reported)"
    });
    if (reported) Object.assign(entry,reported);
    else notice = "Usage numbers were absent or incomplete; no available-slot count has been guessed.";
    const firstCommunity = data.findIndex(item => item.featured !== true);
    data.splice(firstCommunity < 0 ? data.length : firstCommunity, 0, entry);
    action = "add";
  } else if (kind === "count") {
    if (!existing) return { outcome:"needs-review",kind,code,reason:"Code not yet in the catalog; report requires manual triage." };
    const confirmation = field(f,"Confirmation");
    if (!confirmation.includes("[x] I confirm that these figures came from a Muse invite screen")) {
      throw Error("The owner must confirm the figures came from their Muse invite screen.");
    }
    if (String(existing.submittedBy || "").toLowerCase() !== issue.user.login.toLowerCase()) {
      return { outcome:"needs-review",kind,code,reason:"Only the cataloged code owner may submit a quota proposal automatically." };
    }
    const quota = actualQuota(f,date,{
      total:"Total invite quota shown by Muse (if known)",
      used:"Already used invites (if known)",
      remaining:"Remaining invites shown by Muse"
    });
    if (!quota) return { outcome:"needs-review",kind,code,reason:"Total and used/remaining are incomplete; no quota was invented." };
    const target=data.find(item=>item.code===existing.code);
    if(target.reportedCapacity===quota.reportedCapacity &&
       target.reportedUses===quota.reportedUses &&
       target.usageReportedAt===quota.usageReportedAt) {
       return {outcome:"duplicate",kind,code,reason:"The published catalog already has this dated quota."};
    }
    Object.assign(target,quota);
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
  const file=await api("GET","contents/data/invites.json?ref="+sha,token);
  if(file.encoding!=="base64")throw Error("Unexpected catalog encoding.");
  return JSON.parse(Buffer.from(file.content.replace(/\s/g,""),"base64").toString("utf8"));
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

  // Prevent two independent Issue PRs for the same code from racing.
  const prs=await openBotPrs(token);
  const matching=prs.find(pr=>pr.head.ref===proposed.branch);
  if(matching)return {outcome:"already-open",url:matching.html_url,code:proposed.code};
  for (const pr of prs.filter(pr=>pr.head.ref.startsWith("auto/issue-"))) {
    const other=await getCatalog(token,pr.head.sha);
    if(JSON.stringify(other.find(x=>x.code===proposed.code)) !==
       JSON.stringify(catalog.find(x=>x.code===proposed.code))) {
      return {outcome:"needs-review",code:proposed.code,
        reason:"Another open automated PR already changes this code: "+pr.html_url};
    }
  }

  // Never overwrite an existing branch. A branch left behind after a
  // repository-level PR permission denial can be retried without rewriting it.
  const encoded=proposed.branch.split("/").map(encodeURIComponent).join("/");
  const existing=await api("GET","git/ref/heads/"+encoded,token,undefined,true);
  if (!existing) {
    // The branch tree is sourced from the exact current trusted main commit.
    const base=await api("GET","git/commits/"+mainSHA,token);
    const content=JSON.stringify(proposed.data,null,2)+"\n";
    const blob=await api("POST","git/blobs",token,{content,encoding:"utf-8"});
    const tree=await api("POST","git/trees",token,{
      base_tree:base.tree.sha,
      tree:[{path:"data/invites.json",mode:"100644",type:"blob",sha:blob.sha}]
    });
    const commit=await api("POST","git/commits",token,{
      message:"data: "+proposed.action+" "+proposed.code+" (issue #"+issue.number+")",
      tree:tree.sha,parents:[mainSHA]
    });
    await api("POST","git/refs",token,{ref:"refs/heads/"+proposed.branch,sha:commit.sha});
  }
  const title="data: review "+proposed.code+" "+proposed.kind+" (issue #"+issue.number+")";
  const body=[
    "## Automated draft proposal",
    "",
    "Prepared from public Issue #"+issue.number+" by @"+issue.user.login+".",
    "Code: **"+proposed.code+"**. Change: **"+proposed.action+"**.",
    "",
    proposed.notice || "All published figures remain dated community/owner reports, never live Muse availability.",
    "",
    "### Required human checks",
    "- [ ] Verify the submitter, code and any ownership or usage claims",
    "- [ ] Review catalog diff, duplicates and contributor attribution",
    "- [ ] CI and security checks pass",
    "- [ ] Confirm website preview after marking the draft ready",
    "",
    "**Do not auto-merge**. This is not Muse redemption verification.",
    "",
    "Closes #"+issue.number
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
    ") for **"+proposed.code+"**. It needs maintainer review; no website data has been published.");
  // Explicitly dispatch validation on the generated branch. GITHUB_TOKEN PR
  // activity does not reliably start an ordinary CI workflow automatically.
  try {
    await api("POST","actions/workflows/validate.yml/dispatches",token,{ref:proposed.branch});
  } catch(error) {
    await comment(issue,token,"Created [Draft PR #"+pr.number+"]("+pr.html_url+
      ") for **"+proposed.code+"**, but explicit validation dispatch failed: "+
      error.message.slice(0,220)+". A maintainer must run CI before review.");
  }
  return {outcome:"created",url:pr.html_url,number:pr.number,code:proposed.code};
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
