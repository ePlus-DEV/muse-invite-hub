import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { planIssueChange, resolvedInviteComment, readIssueFields, hasRequiredInviteConfirmations, inviteNeedsConfirmationReview, missingInviteConfirmationGuidance, isAutoPublishableNewSocialInvite, isAutoPublishableNewGithubInvite } from "./issue-to-pr.mjs";
import { validateCatalog } from "./validate.mjs";
import { changedRecords } from "./catalog.mjs";

const date="2026-11-11T10:00:00Z";
const share = [
  "### Invite code","","PNSMZZ","",
  "### Public confirmation or context (optional)","","_No response_","",
  "### Uses so far (optional; self-reported)","","_No response_","",
  "### Invite limit (optional; self-reported)","","30","",
  "### Remaining invites (optional; self-reported)","","_No response_","",
  "### Notes (optional)","","_No response_","",
  "### Contributor checklist","",
  "- [x] I am authorized to share this code publicly and understand this issue is public.",
  "- [x] This code is not a password, 2FA code, session token or private credential."
].join("\n");
const count = (values={}) => [
  "### Invite code","","DPNIHH","",
  "### Remaining invites shown by Muse","",values.remaining ?? "3","",
  "### Total invite quota shown by Muse (if known)","",values.total ?? "30","",
  "### Already used invites (if known)","",values.used ?? "_No response_","",
  "### Confirmation","","- [x] I confirm that these figures came from a Muse invite screen, not from copy-click counts or guesses."
].join("\n");
const feedback = (reason) => [
  "### Invite code","","PNSMZZ","",
  "### What happened?","",reason,"",
  "### Additional details (optional)","","_No response_"
].join("\n");
const item={
  id:"eplus-owner-dpnihh",code:"DPNIHH",status:"unverified",
  addedAt:"2026-11-10",submittedBy:"hoangsvit",
  featured:true,ownerConfirmed:true
};
const community={
  id:"community-issue-20",code:"PNSMZZ",status:"unverified",
  addedAt:"2026-11-11",submittedBy:"YHresearcher"
};
const issue=(number,title,body,login="YHresearcher")=>({
  number,title,body,user:{login},state:"open",created_at:date,updated_at:date
});
const telegramBody=(code="ABC123",handle="alice_dev") => [
  "### Invite code","",code,"",
  "### Code source","","Telegram (community code shared through bot)","",
  "### Social post or profile URL (required for Threads, X or Facebook)","","_No response_","",
  "### Public confirmation or context (optional)","","https://t.me/"+handle,"",
  "### Uses so far (optional; self-reported)","","_No response_","",
  "### Invite limit (optional; self-reported)","","_No response_","",
  "### Remaining invites (optional; self-reported)","","_No response_","",
  "### Notes (optional)","","Submitted via Telegram by @"+handle+
    ". Human review required; public profile is not proof of code ownership, redemption or quota.","",
  "### Contributor checklist","",
  "- [x] I am authorized to share this code publicly; I understand this Issue is public.",
  "- [x] This code is not a password, 2FA code, session token or private credential.","",
  "<!-- muse-telegram-submission:"+code+" -->"
].join("\n");

test("Telegram and GitHub use the exact same Share Code Issue Form headings and consent wording",()=>{
  const form=readFileSync(new URL("../.github/ISSUE_TEMPLATE/share-code.yml",import.meta.url),"utf8");
  const labels=[...form.matchAll(/^\s{6}label: (.+)$/gm)].map(match=>match[1].replace(/^"|"$/g,""));
  const body=telegramBody();
  const headings=[...body.matchAll(/^### (.+)$/gm)].map(match=>match[1]);
  assert.deepEqual(headings,labels);
  assert.match(form,/I am authorized to share this code publicly; I understand this Issue is public\./);
  assert.equal(readIssueFields(body)["Code source"],"Telegram (community code shared through bot)");
  assert.equal(hasRequiredInviteConfirmations(body),true);
});

test("Telegram [Invite] Issue creates only a source-attributed, unverified human-review Draft PR",()=>{
  const source=issue(230,"[Invite] ABC123",telegramBody("ABC123","hoang_it"),"hoangsvit");
  const proposal=planIssueChange(source,[item]);
  assert.equal(proposal.outcome,"proposal");
  assert.equal(proposal.branch,"auto/issue-230-invite");
  assert.equal(proposal.action,"add Telegram source");
  const record=proposal.data.find(row=>row.code==="ABC123");
  assert.equal(record.id,"community-issue-230");
  assert.equal(record.feedbackIssueNumber,230);
  assert.equal(record.sourceUrl,"https://t.me/hoang_it");
  assert.equal(record.submittedBy,undefined);
  assert.equal(record.submittedById,undefined);
  assert.equal(record.reportedCapacity,undefined);
  assert.equal(record.reportedRemaining,undefined);
  assert.equal(record.status,"unverified");
  assert.deepEqual(validateCatalog(proposal.data),[]);
  assert.equal(isAutoPublishableNewGithubInvite(source,proposal),false);
  assert.equal(isAutoPublishableNewSocialInvite(source,proposal),false);
});

test("Telegram submissions reject mismatched identity, missing consent and owner quota claims",()=>{
  const body=telegramBody();
  const original=issue(231,"[Invite] ABC123",body,"hoangsvit");
  for(const submitted of [
    {...original,title:"[Invite] DEF456"},
    {...original,body:body.replace("<!-- muse-telegram-submission:ABC123 -->","")},
    {...original,body:body.replace("@alice_dev","@someone_else")},
    {...original,body:body.replace("https://t.me/alice_dev","https://t.me/other_user")},
    {...original,body:body.replace("- [x] I am authorized","- [ ] I am authorized")},
    {...original,body:body.replace("### Code source\n\nTelegram","### Code source\n\nGitHub")},
    {...original,body:body.replace("### Remaining invites (optional; self-reported)\n\n_No response_",
      "### Remaining invites (optional; self-reported)\n\n30")},
    {...original,user:{login:"unrelated-reporter"}}
  ]){
    const plan=planIssueChange(submitted,[item]);
    assert.notEqual(plan.outcome,"proposal",JSON.stringify(submitted).slice(0,160));
  }
  const published=[item,{id:"already-listed",code:"ABC123",status:"unverified",addedAt:"2026-11-11",sourceUrl:"https://t.me/alice_dev"}];
  assert.equal(planIssueChange(original,published).outcome,"already-listed");
  const sameCanonical={...published[1],id:"community-issue-230",feedbackIssueNumber:230};
  assert.equal(planIssueChange(original,[item,sameCanonical]).outcome,"already-published");
  const changedSame={...sameCanonical,sourceUrl:"https://t.me/different_account"};
  assert.equal(planIssueChange(original,[item,changedSame]).outcome,"needs-review");
  const general=issue(232,"[Invite] ABC123",body.replace("<!-- muse-telegram-submission:ABC123 -->",""),"hoangsvit");
  assert.equal(planIssueChange(general,[item]).outcome,"needs-review");
});

test("older [Telegram submission] issues retain backwards-compatible review-only parsing",()=>{
  const body=[
    "<!-- muse-telegram-submission:ABC123 -->",
    "### Invite code","","ABC123","",
    "### Code source","","Telegram (community code shared through bot)","",
    "### Public confirmation or context (optional)","","https://t.me/alice_dev (Telegram profile only, not source-post evidence)","",
    "### Telegram contributor","","@alice_dev (Telegram sender, public attribution accepted during confirmation)","",
    "### Contributor checklist","",
    "- [x] I am authorized to share this code publicly; I understand this Issue is public.",
    "- [x] This code is not a password, 2FA code, session token or private credential."
  ].join("\n");
  const source=issue(230,"[Telegram submission] ABC123",body,"hoangsvit");
  const proposal=planIssueChange(source,[item]);
  assert.equal(proposal.outcome,"proposal");
  assert.equal(proposal.data.find(x=>x.code==="ABC123").sourceUrl,"https://t.me/alice_dev");
  assert.equal(isAutoPublishableNewGithubInvite(source,proposal),false);
});

test("GitHub Issue Forms are parsed by headings, not arbitrary user code",()=>{
  const f=readIssueFields(share);
  assert.equal(f["Invite code"],"PNSMZZ");
  assert.equal(f["Invite limit (optional; self-reported)"],"30");
  assert.equal(f["Uses so far (optional; self-reported)"],"");
  assert.equal(f["Remaining invites (optional; self-reported)"],"");
});
test("Issue #219 Spanish Muse referral text produces an unverified new-code proposal",()=>{
  const text=[
    "Echa un vistazo a Muse, tu agente de IA personal. Canjea mi código en la configuración dentro de las 48 horas posteriores a unirte.",
    "Código: 4WEZN6",
    "https://muse.ai/join"
  ].join("\n");
  const body=[
    "### Invite code","",text,"",
    "### Code source","","GitHub (my own code)","",
    "### Contributor checklist","",
    "- [x] I own this public code or am reporting a code explicitly shared publicly at the source URL above; this issue is public.",
    "- [x] This code is not a password, 2FA code, session token or private credential."
  ].join("\n");
  const p=planIssueChange(issue(219,"[Invite] Código: 4WEZN6",body,"magandayam"),[item]);
  assert.equal(p.outcome,"proposal");
  assert.equal(p.branch,"auto/issue-219-invite");
  assert.equal(p.code,"4WEZN6");
  const added=p.data.find(row=>row.code==="4WEZN6");
  assert.equal(added.status,"unverified");
  assert.equal(added.submittedBy,"magandayam");
  assert.equal(added.reportedCapacity,undefined);
  assert.equal(added.reportedUses,undefined);
  assert.deepEqual(validateCatalog(p.data),[]);
});

test("new invited code becomes an unverified draft proposal, never 30 remaining by assumption",()=>{
  const old=[item];
  const p=planIssueChange(issue(20,"[Invite]",share),old);
  assert.equal(p.outcome,"proposal");
  assert.equal(p.branch,"auto/issue-20-invite");
  const newItem=p.data.find(x=>x.code==="PNSMZZ");
  assert.equal(newItem.status,"unverified");
  assert.equal(newItem.submittedBy,"YHresearcher");
  assert.equal(newItem.reportedCapacity,undefined);
  assert.equal(newItem.reportedUses,undefined);
  assert.equal(old.length,1);
  assert.deepEqual(validateCatalog(p.data),[]);
});
test("valid complete new owner quota is a dated, unverified report",()=>{
  const body=share.replace("### Uses so far (optional; self-reported)\n\n_No response_",
    "### Uses so far (optional; self-reported)\n\n27");
  const p=planIssueChange(issue(25,"[Invite] owner",body),[item]);
  const next=p.data.find(x=>x.code==="PNSMZZ");
  assert.deepEqual([next.reportedCapacity,next.reportedUses,next.usageReportedAt],[30,27,"2026-11-11"]);
});
test("existing codes are never duplicated under another account",()=>{
  const p=planIssueChange(issue(26,"[Invite]",share,"another-user"),[item,community]);
  assert.equal(p.outcome,"needs-review");
});
test("existing code can be updated by its GitHub owner from Issue #28 Notes",()=>{
  const existing={ ...community, code:"ARKHZZ", id:"jx-issue-19", submittedBy:"pdm0809",
    reportedCapacity:17, reportedUses:0, usageReportedAt:"2026-11-10" };
  const body=share.replace("PNSMZZ","ARKHZZ")
    .replace("### Invite limit (optional; self-reported)\n\n30",
      "### Invite limit (optional; self-reported)\n\n_No response_")
    .replace("### Notes (optional)\n\n_No response_",
      "### Notes (optional)\n\nInvite code ARKHZZ — 17 uses left. Enter it within 48 hours.");
  const ownerIssue={...issue(28,"[Invite] ARKHZZ",body,"pdm0809"),user:{login:"pdm0809",id:316039127}};
  const p=planIssueChange(ownerIssue,[item,existing]);
  assert.equal(p.outcome,"proposal");
  assert.equal(p.action,"update owner report");
  const updated=p.data.find(x=>x.code==="ARKHZZ");
  assert.equal(p.data.length,2);
  assert.equal(updated.reportedRemaining,17);
  assert.equal(updated.reportedCapacity,undefined);
  assert.equal(updated.reportedUses,undefined);
  assert.equal(updated.usageReportedAt,"2026-11-11");
  assert.equal(updated.submittedBy,"pdm0809");
  assert.equal(updated.submittedById,316039127);
  assert.equal(updated.id,"jx-issue-19");
  assert.deepEqual(validateCatalog(p.data),[]);
  assert.equal(planIssueChange(ownerIssue,p.data).outcome,"duplicate");
});
test("duplicate from a different owner requires manual review",()=>{
  const body=share.replace("### Remaining invites (optional; self-reported)\n\n_No response_",
    "### Remaining invites (optional; self-reported)\n\n11");
  const p=planIssueChange(issue(28,"[Invite]",body,"different-user"),[item,community]);
  assert.equal(p.outcome,"needs-review");
});
test("a bound GitHub numeric ID blocks an impostor with the same username",()=>{
  const bound={...community,submittedById:42};
  const body=share.replace("### Remaining invites (optional; self-reported)\n\n_No response_",
    "### Remaining invites (optional; self-reported)\n\n11");
  const p=planIssueChange({...issue(28,"[Invite]",body),user:{login:"YHresearcher",id:77}},[item,bound]);
  assert.equal(p.outcome,"needs-review");
});
test("newer owner reports cannot be overwritten by an older Issue",()=>{
  const old={...community,reportedRemaining:5,usageReportedAt:"2026-11-12"};
  const body=share.replace("### Remaining invites (optional; self-reported)\n\n_No response_",
    "### Remaining invites (optional; self-reported)\n\n11");
  const p=planIssueChange(issue(28,"[Invite]",body),[item,old]);
  assert.equal(p.outcome,"needs-review");
});
test("permission confirmations are mandatory and untrusted numbers fail closed",()=>{
  const invalid=share.replace("[x] I am authorized","[ ] I am authorized");
  assert.throws(()=>planIssueChange(issue(26,"[Invite]",invalid),[item]),/confirmations/);
  const negative=share.replace("### Uses so far (optional; self-reported)\n\n_No response_",
    "### Uses so far (optional; self-reported)\n\n-1");
  assert.throws(()=>planIssueChange(issue(26,"[Invite]",negative),[item]),/integer/);
});
test("API-created invite Issues without required confirmations remain open for review", () => {
  const missing = share.replace(/### Contributor checklist[\s\S]*$/, "");
  const rawIssue = issue(113, "[Invite] 0W9L6E",
    missing.replace("PNSMZZ", "0W9L6E"), "hermes-blue");
  assert.equal(hasRequiredInviteConfirmations(rawIssue.body), false);
  assert.equal(inviteNeedsConfirmationReview(rawIssue), true);
  assert.throws(() => planIssueChange(rawIssue,[item]), /confirmations/);
  assert.equal(inviteNeedsConfirmationReview({...rawIssue,state:"closed"}), false);
  assert.equal(inviteNeedsConfirmationReview({...rawIssue,pull_request:{number:1}}), false);
  assert.equal(inviteNeedsConfirmationReview(issue(113,"Support request",missing)), false);
});

test("missing confirmations receive actionable guidance without closure or impersonated consent", () => {
  const guidance=missingInviteConfirmationGuidance();
  assert.match(guidance,/This one stays open/);
  assert.match(guidance,/… → Edit/);
  assert.match(guidance,/### Contributor checklist/);
  assert.match(guidance,/- \[ \] I own this public code/);
  assert.match(guidance,/- \[ \] This code is not a password/);
  assert.doesNotMatch(guidance,/- \[x\]/);
  assert.match(guidance,/\[Share Code form\]/);
  assert.match(guidance,/\n\n/);
});

test("both consent checkboxes must be checked and cannot be spoofed by notes", () => {
  const missingOne=share.replace("- [x] This code is not a password","- [ ] This code is not a password");
  assert.equal(hasRequiredInviteConfirmations(missingOne), false);
  assert.equal(inviteNeedsConfirmationReview(issue(210,"[Invite]",missingOne)),true);
  const forged=share.replace("- [x] I am authorized","Example: - [x] I am authorized");
  assert.equal(hasRequiredInviteConfirmations(forged),false);
  assert.equal(hasRequiredInviteConfirmations(share),true);
  assert.equal(hasRequiredInviteConfirmations(share.replace(/- \[x\]/g,"- [X]")),true);
  assert.equal(inviteNeedsConfirmationReview(issue(211,"[Invite]",share)),false);
  assert.equal(inviteNeedsConfirmationReview(issue(212,"[Count update]",missingOne)),false);
});

test("count updates require owner confirmation, known total and internally consistent numbers",()=>{
  const p=planIssueChange(issue(14,"[Count update]",count(),"hoangsvit"),[item,community]);
  assert.equal(p.outcome,"proposal");
  assert.equal(p.kind,"count");
  const next=p.data.find(x=>x.code==="DPNIHH");
  assert.deepEqual([next.reportedCapacity,next.reportedUses,next.usageReportedAt],[30,27,"2026-11-11"]);
  const wrongOwner=planIssueChange(issue(16,"[Count update]",count()),[item,community]);
  assert.equal(wrongOwner.outcome,"needs-review");
  const noTotal=planIssueChange(issue(17,"[Count update]",count({total:"_No response_"}),"hoangsvit"),[item,community]);
  assert.equal(noTotal.outcome,"proposal");
  assert.equal(noTotal.data[0].reportedRemaining,3);
  assert.equal(noTotal.data[0].reportedCapacity,undefined);
  assert.equal(noTotal.data[0].reportedUses,undefined);
  assert.throws(()=>planIssueChange(issue(14,"[Count update]",
    count({used:"6"}),"hoangsvit"),[item]),/inconsistent/);
});
test("feedback is proposed for human review, not marked as official Muse verification",()=>{
  const p=planIssueChange(issue(30,"[Code feedback]",
    feedback("Muse accepted the code (worked for me)")),[item,community]);
  assert.equal(p.outcome,"proposal");
  assert.equal(p.data.find(x=>x.code==="PNSMZZ").status,"reported-working");
  assert.match(p.notice,/NOT confirmation by Muse/);
  const noChange=planIssueChange(issue(31,"[Code feedback]",
    feedback("I could not find the redeem option")),[item,community]);
  assert.equal(noChange.outcome,"needs-review");
  const featured=planIssueChange(issue(32,"[Code feedback]",
    feedback("Muse did not accept the code").replace("PNSMZZ","DPNIHH")),[item]);
  assert.equal(featured.outcome,"needs-review");
});
test("unsupported and unsafe issues cannot create catalog proposals",()=>{
  assert.equal(planIssueChange(issue(20,"Support request",share),[item]).outcome,"unsupported");
  assert.throws(()=>planIssueChange(issue(20,"[Invite]",
    share.replace("PNSMZZ","../../evil")),[item]),/Invite code/);
});


const updatedShare = (source, url="", quota=false) => [
  "### Invite code", "", "18I70N", "",
  "### Code source", "", source, "",
  "### Social post or profile URL (required for Threads, X or Facebook)", "", url || "_No response_", "",
  "### Public confirmation or context (optional)", "", "_No response_", "",
  "### Uses so far (optional; self-reported)", "", "_No response_", "",
  "### Invite limit (optional; self-reported)", "", quota ? "30" : "_No response_", "",
  "### Remaining invites (optional; self-reported)", "", "_No response_", "",
  "### Notes (optional)", "", "_No response_", "",
  "### Contributor checklist", "",
  "- [x] I own this public code or am reporting a code explicitly shared publicly at the source URL above; this issue is public.",
  "- [x] This code is not a password, 2FA code, session token or private credential."
].join("\n");

test("new GitHub form keeps GitHub authorship and owner quota safely", () => {
  const body=updatedShare("GitHub (my own code)").replace("18I70N","XZ4PV6");
  const result=planIssueChange(issue(65,"[Invite]",body,"github-report"),[item]);
  assert.equal(result.outcome,"proposal");
  const entry=result.data.find(x=>x.code==="XZ4PV6");
  assert.equal(entry.submittedBy,"github-report");
  assert.equal(entry.sourceUrl,undefined);
  assert.deepEqual(validateCatalog(result.data),[]);
});

test("public Threads post creates only an unverified attributed draft, not a GitHub owner", () => {
  const url="https://www.threads.com/@baijiling2/post/Dfm1NkvE8jo";
  const i=issue(66,"[Invite] 18I70N",updatedShare("Threads (public code I found)",url),"curator-account");
  const result=planIssueChange(i,[item]);
  assert.equal(result.outcome,"proposal");
  assert.equal(result.action,"add Threads source");
  assert.equal(result.branch,"auto/issue-66-invite");
  const entry=result.data.find(x=>x.code==="18I70N");
  assert.equal(entry.sourceUrl,url);
  assert.equal(entry.submittedBy,undefined);
  assert.equal(entry.submittedById,undefined);
  assert.equal(entry.reportedCapacity,undefined);
  assert.equal(entry.reportedRemaining,undefined);
  assert.equal(entry.status,"unverified");
  assert.match(result.notice,/NOT the GitHub reporter/);
  assert.deepEqual(validateCatalog(result.data),[]);
});

test("profile-only or malformed Threads sources and false source selections need review", () => {
  const base=updatedShare("Threads (public code I found)","https://www.threads.com/@baijiling2");
  assert.equal(planIssueChange(issue(67,"[Invite]",base),[item]).outcome,"needs-review");
  const invalid=updatedShare("Threads (public code I found)","https://threads.com.evil.example/@baijiling2/post/x");
  assert.equal(planIssueChange(issue(67,"[Invite]",invalid),[item]).outcome,"needs-review");
  const foreign=updatedShare("GitHub (my own code)","https://www.threads.com/@baijiling2/post/abc");
  assert.equal(planIssueChange(issue(67,"[Invite]",foreign),[item]).outcome,"needs-review");
  const unknown=updatedShare("Discord (my own code)");
  assert.equal(planIssueChange(issue(67,"[Invite]",unknown),[item]).outcome,"needs-review");
  const legacy=share.replace("PNSMZZ","18I70N")
    .replace("### Public confirmation or context (optional)\n\n_No response_",
      "### Public confirmation or context (optional)\n\nhttps://www.threads.com/@baijiling2/post/abc");
  assert.equal(planIssueChange(issue(67,"[Invite]",legacy),[item]).outcome,"needs-review");
});

test("a third-party Threads reporter cannot claim quotas or edit existing sources", () => {
  const url="https://www.threads.com/@baijiling2/post/abc";
  const threadsBody=updatedShare("Threads (public code I found)",url,true);
  assert.equal(planIssueChange(issue(68,"[Invite]",threadsBody),[item]).outcome,"needs-review");
  const sourceOnly={id:"threads-code",code:"18I70N",status:"unverified",
    addedAt:"2026-11-11",sourceUrl:url};
  const original=[item,sourceOnly];
  const same=planIssueChange(issue(69,"[Invite]",updatedShare("Threads (public code I found)",url)),original);
  assert.equal(same.outcome,"already-listed");
  assert.deepEqual(original,[item,sourceOnly]);
  const hijackBody=updatedShare("GitHub (my own code)");
  assert.equal(planIssueChange(issue(70,"[Invite]",hijackBody),original).outcome,"already-listed");
  const countBody=count().replace("DPNIHH","18I70N");
  assert.equal(planIssueChange(issue(71,"[Count update]",countBody,"baijiling2"),original).outcome,"needs-review");
});


const withListingPlatform = (body, platform) =>
  body + "\n\n### Listing platform\n\n" + platform;

test("report feedback uses code + platform, never just an identical username", () => {
  const github={id:"github-same-name",code:"GH2222",status:"unverified",
    addedAt:"2026-11-11",submittedBy:"sameperson"};
  const threads={id:"threads-same-name",code:"TH2222",status:"unverified",
    addedAt:"2026-11-11",sourceUrl:"https://www.threads.com/@sameperson/post/example"};
  const catalog=[github,threads];
  assert.deepEqual(validateCatalog(catalog),[]);

  const threadsFeedback=feedback("Muse accepted the code (worked for me)")
    .replace("PNSMZZ","TH2222");
  const good=planIssueChange(issue(72,"[Code feedback]",
    withListingPlatform(threadsFeedback,"Threads"),"sameperson"),catalog);
  assert.equal(good.outcome,"proposal");
  assert.equal(good.data.find(x=>x.code==="TH2222").status,"reported-working");
  assert.equal(good.data.find(x=>x.code==="GH2222").status,"unverified");
  assert.equal(good.data.find(x=>x.code==="TH2222").submittedBy,undefined);

  const mismatch=planIssueChange(issue(73,"[Code feedback]",
    withListingPlatform(threadsFeedback,"GitHub"),"sameperson"),catalog);
  assert.equal(mismatch.outcome,"needs-review");
  assert.match(mismatch.reason,/does not match/);

  const wrongGithub=planIssueChange(issue(74,"[Code feedback]",
    withListingPlatform(feedback("Muse did not accept the code")
      .replace("PNSMZZ","GH2222"),"Threads"),"sameperson"),catalog);
  assert.equal(wrongGithub.outcome,"needs-review");

  const invalid=planIssueChange(issue(75,"[Code feedback]",
    withListingPlatform(threadsFeedback,"Reddit"),"sameperson"),catalog);
  assert.equal(invalid.outcome,"needs-review");
});

test("count form checks platform before owner identity for same-name cross-platform reports", () => {
  const threads={id:"threads-same-name",code:"TH2222",status:"unverified",
    addedAt:"2026-11-11",sourceUrl:"https://www.threads.com/@sameperson/post/example"};
  const github={id:"github-same-name",code:"GH2222",status:"unverified",
    addedAt:"2026-11-11",submittedBy:"sameperson"};
  const catalog=[github,threads];
  const threadsCount=count().replace("DPNIHH","TH2222");
  const attempted=planIssueChange(issue(76,"[Count update]",
    withListingPlatform(threadsCount,"Threads"),"sameperson"),catalog);
  assert.equal(attempted.outcome,"needs-review");
  assert.match(attempted.reason,/Social attribution/);

  const mismatch=planIssueChange(issue(77,"[Count update]",
    withListingPlatform(threadsCount,"GitHub"),"sameperson"),catalog);
  assert.equal(mismatch.outcome,"needs-review");
  assert.match(mismatch.reason,/does not match/);

  const githubCount=count().replace("DPNIHH","GH2222");
  const allowed=planIssueChange(issue(78,"[Count update]",
    withListingPlatform(githubCount,"GitHub"),"sameperson"),catalog);
  assert.equal(allowed.outcome,"proposal");
  assert.equal(allowed.data.find(x=>x.code==="GH2222").reportedCapacity,30);
  assert.equal(allowed.data.find(x=>x.code==="TH2222").reportedCapacity,undefined);
});

test("matching usernames from a Threads source never assert GitHub ownership on share", () => {
  const body=updatedShare("Threads (public code I found)",
    "https://www.threads.com/@baijiling2/post/example");
  const result=planIssueChange(issue(79,"[Invite]",body,"baijiling2"),[item]);
  assert.equal(result.outcome,"proposal");
  const next=result.data.find(x=>x.code==="18I70N");
  assert.equal(next.sourceUrl,"https://www.threads.com/@baijiling2/post/example");
  assert.equal(next.submittedBy,undefined);
  assert.equal(next.submittedById,undefined);
});

test("X and Facebook public post Issues propose unverified drafts without GitHub ownership", () => {
  for (const [platform,code,url,expectedPlatform] of [
    ["X (Twitter) (public code I found)","XX1234","https://x.com/sameperson/status/1234567890123456","X (Twitter)"],
    ["Facebook (public code I found)","FB1234","https://www.facebook.com/sameperson/posts/pfbid0123456789","Facebook"]
  ]) {
    const body = updatedShare(platform,url).replace("18I70N",code);
    const result = planIssueChange(issue(85,"[Invite] "+code,body,"sameperson"),[item]);
    assert.equal(result.outcome,"proposal",expectedPlatform);
    assert.equal(result.action,"add "+expectedPlatform+" source");
    const entry = result.data.find(row=>row.code===code);
    assert.equal(entry.sourceUrl,url);
    assert.equal(entry.submittedBy,undefined);
    assert.equal(entry.submittedById,undefined);
    assert.equal(entry.reportedCapacity,undefined);
    assert.equal(entry.status,"unverified");
    assert.deepEqual(validateCatalog(result.data),[]);
    assert.match(result.notice,/NOT the GitHub reporter/);
  }
});

test("issue #240 Facebook group post produces an unverified human-review proposal", () => {
  const url="https://www.facebook.com/groups/referralcodeshare/posts/1169239249161106/";
  const body=updatedShare("Facebook (public code I found)",url).replace("18I70N","FT4SHN")
    .replace("I own this public code or am reporting a code explicitly shared publicly at the source URL above; this issue is public.",
      "I am authorized to share this code publicly; I understand this Issue is public.");
  const report=issue(240,"[Invite] FT4SHN",body,"gary2222hub");
  assert.equal(hasRequiredInviteConfirmations(body),true);
  const proposal=planIssueChange(report,[item]);
  assert.equal(proposal.outcome,"proposal");
  assert.equal(proposal.action,"add Facebook source");
  assert.equal(proposal.branch,"auto/issue-240-invite");
  const listing=proposal.data.find(entry=>entry.code==="FT4SHN");
  assert.equal(listing.sourceUrl,url);
  assert.equal(listing.feedbackIssueNumber,240);
  assert.equal(listing.submittedBy,undefined);
  assert.equal(listing.submittedById,undefined);
  assert.equal(listing.status,"unverified");
  assert.match(proposal.notice,/not the post author.s identity/i);
  assert.deepEqual(validateCatalog(proposal.data),[]);
  assert.equal(isAutoPublishableNewSocialInvite(report,proposal),false,
    "group links cannot prove the post author and must stay in a review-only Draft PR");
});

test("reprocessing Issue #240 after its reviewed merge is already-listed, not rejected", () => {
  const url="https://www.facebook.com/groups/referralcodeshare/posts/1169239249161106/";
  const body=updatedShare("Facebook (public code I found)",url).replace("18I70N","FT4SHN")
    .replace("I own this public code or am reporting a code explicitly shared publicly at the source URL above; this issue is public.",
      "I am authorized to share this code publicly; I understand this Issue is public.");
  const original=issue(240,"[Invite] FT4SHN",body,"gary2222hub");
  const published={
    id:"community-issue-240",code:"FT4SHN",status:"unverified",
    addedAt:"2026-11-17",feedbackIssueNumber:240,sourceUrl:url
  };
  const replay=planIssueChange(original,[item,published]);
  assert.equal(replay.outcome,"already-published");
  assert.match(replay.reason,/already in the main catalog/);
  // A new reporter, changed source, or owner-only quota claim is not a replay.
  const duplicate=planIssueChange(issue(241,"[Invite] FT4SHN",body,"other"),[item,published]);
  assert.equal(duplicate.outcome,"already-listed");
  assert.equal(duplicate.canonicalIssueNumber,240);
  const changed=body.replace(url,"https://www.facebook.com/groups/referralcodeshare/posts/1169239249161107/");
  assert.equal(planIssueChange({...original,body:changed},[item,published]).outcome,"needs-review");
  const quota=body.replace("### Remaining invites (optional; self-reported)\n\n_No response_",
    "### Remaining invites (optional; self-reported)\n\n3");
  assert.equal(planIssueChange({...original,body:quota},[item,published]).outcome,"needs-review");
  assert.equal(isAutoPublishableNewSocialInvite(original,replay),false);
});

test("a duplicate invite shows only actual published detail and canonical Issue links",()=>{
  const comment=resolvedInviteComment({codes:["FT4SHN"],canonicalIssueNumbers:[240],
    liveCodes:["FT4SHN"],canonical:false});
  assert.match(comment,/https:\/\/muse\.eplus\.dev\/codes\/FT4SHN\//);
  assert.match(comment,/https:\/\/github\.com\/ePlus-DEV\/muse-invite-hub\/issues\/240/);
  assert.match(comment,/Closing this duplicate/);
  assert.match(comment,/Being listed does/);
  const original=resolvedInviteComment({codes:["FT4SHN"],liveCodes:["FT4SHN"],canonical:true});
  assert.match(original,/original contribution has been published/);
  assert.doesNotMatch(original,/Original discussion/);
});

test("all-listed multi-code reports resolve as duplicates, mixed batches remain open",()=>{
  const clean=share.replace("### Invite limit (optional; self-reported)\n\n30",
    "### Invite limit (optional; self-reported)\n\n_No response_");
  const make=value=>clean.replace("PNSMZZ",value);
  const rows=[item,
    {id:"community-issue-150-alfa12",code:"ALFA12",status:"unverified",
      feedbackIssueNumber:150,addedAt:"2026-11-11",submittedBy:"alfa"},
    {id:"community-issue-160-bravo2",code:"BRAVO2",status:"unverified",
      feedbackIssueNumber:160,addedAt:"2026-11-11",submittedBy:"bravo"}];
  const duplicate=planIssueChange(issue(170,"[Invite]",make("ALFA12, BRAVO2")),rows);
  assert.equal(duplicate.outcome,"already-listed");
  assert.deepEqual(duplicate.codes,["ALFA12","BRAVO2"]);
  assert.deepEqual(duplicate.canonicalIssueNumbers,[150,160]);
  const sameIssueRows=rows.map(row=>row.code==="ALFA12"||row.code==="BRAVO2"
    ? {...row,feedbackIssueNumber:170} : row);
  assert.equal(planIssueChange(issue(170,"[Invite]",make("ALFA12, BRAVO2")),
    sameIssueRows).outcome,"already-published");
  const mixed=planIssueChange(issue(171,"[Invite]",make("ALFA12, NEW123")),rows);
  assert.equal(mixed.outcome,"needs-review");
});

test("reject wrong social source, profile-only links and third-party quota claims", () => {
  const link = "https://x.com/sameperson/status/1234567890";
  const xBody = updatedShare("X (Twitter) (public code I found)",link);
  assert.equal(planIssueChange(issue(86,"[Invite]",xBody.replace(link,"https://x.com/sameperson")),[item]).outcome,"needs-review");
  assert.equal(planIssueChange(issue(87,"[Invite]",xBody.replace(link,"https://www.facebook.com/sameperson/posts/pfbid12345")),[item]).outcome,"needs-review");
  assert.equal(planIssueChange(issue(88,"[Invite]",updatedShare("X (Twitter) (public code I found)",link,true)),[item]).outcome,"needs-review");
  assert.equal(planIssueChange(issue(89,"[Invite]",updatedShare("Facebook (public code I found)","https://www.facebook.com/share/p/example")),[item]).outcome,"needs-review");
});

test("X and Facebook reports cannot hijack same-named GitHub or Threads accounts", () => {
  const existing = [
    {id:"x-acc",code:"XX1234",status:"unverified",addedAt:"2026-11-11",
      sourceUrl:"https://x.com/sameperson/status/1234567890"},
    {id:"facebook-acc",code:"FB1234",status:"unverified",addedAt:"2026-11-11",
      sourceUrl:"https://www.facebook.com/sameperson/posts/pfbid123456"},
    {id:"github-acc",code:"GH1234",status:"unverified",addedAt:"2026-11-11",
      submittedBy:"sameperson"}
  ];
  const input=feedback("Muse accepted the code (worked for me)").replace("PNSMZZ","XX1234");
  const good=planIssueChange(issue(90,"[Code feedback]",
    withListingPlatform(input,"X (Twitter)"),"sameperson"),[item,...existing]);
  assert.equal(good.outcome,"proposal");
  assert.equal(good.data.find(row=>row.code==="XX1234").status,"reported-working");
  assert.equal(good.data.find(row=>row.code==="GH1234").status,"unverified");
  assert.equal(planIssueChange(issue(91,"[Code feedback]",
    withListingPlatform(input,"GitHub"),"sameperson"),[item,...existing]).outcome,"needs-review");
  const fbInput=feedback("Muse did not accept the code").replace("PNSMZZ","FB1234");
  assert.equal(planIssueChange(issue(92,"[Code feedback]",
    withListingPlatform(fbInput,"Facebook"),"sameperson"),[item,...existing]).outcome,"proposal");
  const fbCount=count().replace("DPNIHH","FB1234");
  assert.equal(planIssueChange(issue(93,"[Count update]",
    withListingPlatform(fbCount,"Facebook"),"sameperson"),[item,...existing]).outcome,"needs-review");
  assert.equal(planIssueChange(issue(94,"[Invite]",
    updatedShare("GitHub (my own code)").replace("18I70N","XX1234"),"sameperson"),[item,...existing]).outcome,"already-listed");
});

test("structured Share Code form accepts contributor-edited title and uppercase checkmarks",()=>{
  const body = share.replaceAll("- [x]", "- [X]")
    .replace("### Public confirmation or context (optional)",
      "### Code source\n\nGitHub (my own code)\n\n### Public confirmation or context (optional)");
  for (const title of ["Get 30 billion Muse tokens.", "9NEXQ8 US ONLY", "[Invite] PNSMZZ"]) {
    const result = planIssueChange(issue(99,title,body),[item]);
    assert.equal(result.outcome,"proposal");
    assert.equal(result.kind,"invite");
    assert.deepEqual(validateCatalog(result.data),[]);
  }
  const unchecked = body.replace("- [X] This code is not a password","- [ ] This code is not a password");
  assert.throws(()=>planIssueChange(issue(100,"Custom title",unchecked),[item]),/confirmations/);
  const unstructured = share.replace("- [x]","- [X]");
  assert.equal(planIssueChange(issue(101,"Free-form code",unstructured),[item]).outcome,"unsupported");
});


test("a single Share Code Issue can propose two independently stored codes",()=>{
  const body=share.replace("PNSMZZ","ALFA12,\nBRAVO2")
    .replace("### Invite limit (optional; self-reported)\n\n30",
      "### Invite limit (optional; self-reported)\n\n_No response_");
  const original=[item];
  const result=planIssueChange(issue(120,"[Invite] two codes",body),original);
  assert.equal(result.outcome,"proposal");
  assert.deepEqual(result.codes,["ALFA12","BRAVO2"]);
  assert.equal(result.branch,"auto/issue-120-invite");
  const first=result.data.find(entry=>entry.code==="ALFA12");
  const second=result.data.find(entry=>entry.code==="BRAVO2");
  assert.equal(first.id,"community-issue-120-alfa12");
  assert.equal(second.id,"community-issue-120-bravo2");
  assert.equal(first.feedbackIssueNumber,120);
  assert.equal(second.feedbackIssueNumber,120);
  assert.equal(first.reportedCapacity,undefined);
  assert.equal(second.reportedCapacity,undefined);
  assert.deepEqual(changedRecords(original,result.data,result.codes).map(x=>x.path),
    ["data/invite-records/community-issue-120-alfa12.json",
      "data/invite-records/community-issue-120-bravo2.json"]);
  assert.deepEqual(validateCatalog(result.data),[]);
  assert.equal(original.length,1);
});

test("multiple code submissions reject duplicates, malformed tokens and shared quota",()=>{
  const clean=share.replace("### Invite limit (optional; self-reported)\n\n30",
    "### Invite limit (optional; self-reported)\n\n_No response_");
  const makeCodes=value=>clean.replace("PNSMZZ",value);
  assert.throws(()=>planIssueChange(issue(121,"[Invite]",makeCodes("ALFA12, alfa12")),[item]),
    /distinct/);
  assert.throws(()=>planIssueChange(issue(121,"[Invite]",makeCodes("ALFA12, ../bad")),[item]),
    /Invite code/);
  const quota=planIssueChange(issue(121,"[Invite]",share.replace("PNSMZZ","ALFA12, BRAVO2")),[item]);
  assert.equal(quota.outcome,"needs-review");
  assert.match(quota.reason,/per-code/);
  const existing=planIssueChange(issue(121,"[Invite]",makeCodes("PNSMZZ, BRAVO2")),[item,community]);
  assert.equal(existing.outcome,"needs-review");
  assert.match(existing.reason,/already/);
});


test("real eplus-bot Issue PR workflow never attempts to update legacy bot comments",()=>{
  const source=readFileSync(new URL("./issue-to-pr.mjs",import.meta.url),"utf8");
  assert.match(source,/entry\.user\?\.login==="eplus-bot"/);
  assert.doesNotMatch(source,/messages\.find\(entry=>\["github-actions\[bot\]","eplus-bot"\]/);
  const workflow=readFileSync(new URL("../.github/workflows/issue-to-pr.yml",import.meta.url),"utf8");
  assert.match(workflow,/GH_TOKEN: \$\{\{ secrets\.EPLUS_BOT_TOKEN \}\}/);
  assert.match(workflow,/test "\$\(gh api user --jq \.login\)" = "eplus-bot"/);
  assert.doesNotMatch(workflow,/GH_TOKEN: \$\{\{ github\.token \}\}/);
});


test("Issue #167 promotional text with explicit Code line still produces a safe new invite proposal",()=>{
  const pasted="Check out Muse, your personal AI agent. Redeem my code in Settings within 48 hours of joining and we'll both get 1 billion Muse tokens.\n\nCode: 8IJ5BD";
  const fullBody=share.replace("### Invite code\n\nPNSMZZ","### Invite code\n\n"+pasted)
    .replace("### Public confirmation or context (optional)",
      "### Code source\n\nGitHub (my own code)\n\n### Public confirmation or context (optional)")
    .replace("### Invite limit (optional; self-reported)\n\n30",
      "### Invite limit (optional; self-reported)\n\n_No response_");
  const incoming=issue(167,"8IJ5BD",fullBody,"devampatel1208-del");
  const planned=planIssueChange(incoming,[item]);
  assert.equal(planned.outcome,"proposal");
  assert.equal(planned.code,"8IJ5BD");
  assert.equal(planned.branch,"auto/issue-167-invite");
  const record=planned.data.find(x=>x.code==="8IJ5BD");
  assert.equal(record.status,"unverified");
  assert.equal(record.reportedCapacity,undefined);
  assert.equal(record.reportedUses,undefined);
  assert.equal(record.submittedBy,"devampatel1208-del");
  assert.deepEqual(validateCatalog(planned.data),[]);
});


test("new public-post social code is auto-listable as unverified with user responsibility",()=>{
  const publicX=updatedShare("X (Twitter) (public code I found)",
    "https://x.com/xiyaodao/status/2121891507309314522").replace("18I70N","BM69LI");
  const incoming=issue(163,"[Invite] BM69LI",publicX,"xiyaodaozhu");
  const planned=planIssueChange(incoming,[item]);
  assert.equal(planned.outcome,"proposal");
  assert.equal(isAutoPublishableNewSocialInvite(incoming,planned),true);
  const entry=planned.data.find(row=>row.code==="BM69LI");
  assert.equal(entry.status,"unverified");
  assert.equal(entry.sourceUrl,"https://x.com/xiyaodao/status/2121891507309314522");
  assert.equal(entry.submittedBy,undefined);
  assert.equal(entry.reportedRemaining,undefined);
  assert.match(planned.notice,/NOT independently verified/);
  for(const bad of [
    incoming.body.replace("x.com/xiyaodao/status/2121891507309314522","x.com/xiyaodao"),
    incoming.body.replace("- [x] I own this public code","- [ ] I own this public code"),
    incoming.body.replace("### Remaining invites (optional; self-reported)\n\n_No response_",
      "### Remaining invites (optional; self-reported)\n\n30")
  ]){
    const altered={...incoming,body:bad};
    let next;
    try{next=planIssueChange(altered,[item])}catch{continue}
    assert.equal(isAutoPublishableNewSocialInvite(altered,next),false);
  }
});


test("new Issue code parser rejects non-six-character and hyphenated invites",()=>{
  for(const code of ["ABCDE","ABCDEFG","ABC-12","AB_C12"]){
    const invalid=share.replace("PNSMZZ",code);
    assert.throws(()=>planIssueChange(issue(600,"[Invite]",invalid),[]),/6-character/);
  }
  const normalized=share.replace("PNSMZZ","ab12c3");
  const p=planIssueChange(issue(601,"[Invite]",normalized),[]);
  assert.equal(p.code,"AB12C3");
});

test("Issue #208: explicit no-social explanation and unknown Muse quotas are absent data", () => {
  const input = updatedShare("GitHub (my own code)",
    "_No social source; this is my own referral code._")
    .replace("18I70N", "FQH1S7")
    .replace("### Uses so far (optional; self-reported)\n\n_No response_",
      "### Uses so far (optional; self-reported)\n\n_Not currently verified from the Muse invite screen._")
    .replace("### Invite limit (optional; self-reported)\n\n_No response_",
      "### Invite limit (optional; self-reported)\n\n_Not currently verified from the Muse invite screen._")
    .replace("### Remaining invites (optional; self-reported)\n\n_No response_",
      "### Remaining invites (optional; self-reported)\n\n_Not currently verified from the Muse invite screen._")
    .replace("### Public confirmation or context (optional)\n\n_No response_",
      "### Public confirmation or context (optional)\n\nhttps://muse.ai/join");
  const original = issue(208, "[Invite] FQH1S7", input, "zhou04009-prog");
  original.user.id=334235946;
  const result=planIssueChange(original, [item]);
  assert.equal(result.outcome, "proposal");
  assert.equal(result.action, "add");
  assert.equal(result.branch, "auto/issue-208-invite");
  const entry=result.data.find(x=>x.code==="FQH1S7");
  assert.equal(entry?.submittedBy, "zhou04009-prog");
  assert.equal(entry?.submittedById, 334235946);
  assert.equal(entry?.feedbackIssueNumber, 208);
  assert.equal(entry?.status, "unverified");
  assert.equal(entry?.sourceUrl, undefined);
  assert.equal(entry?.reportedCapacity, undefined);
  assert.equal(entry?.reportedUses, undefined);
  assert.equal(entry?.reportedRemaining, undefined);
  assert.deepEqual(validateCatalog(result.data), []);
});

test("GitHub-own social URL still cannot be smuggled as an absence statement", () => {
  for (const description of [
    "No social source; https://x.com/person/status/123",
    "Found on Threads without a URL", "https://www.threads.com/@user/post/123"
  ]) {
    const input=updatedShare("GitHub (my own code)",description);
    assert.equal(planIssueChange(issue(209, "[Invite]", input),[item]).outcome, "needs-review");
  }
  const invalidQuota=updatedShare("GitHub (my own code)").replace(
    "### Invite limit (optional; self-reported)\n\n_No response_",
    "### Invite limit (optional; self-reported)\n\nabout 30");
  assert.throws(()=>planIssueChange(issue(209,"[Invite]",invalidQuota),[item]),/integer/);
});
