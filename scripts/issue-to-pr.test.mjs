import test from "node:test";
import assert from "node:assert/strict";
import { planIssueChange, readIssueFields } from "./issue-to-pr.mjs";
import { validateCatalog } from "./validate.mjs";

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
test("GitHub Issue Forms are parsed by headings, not arbitrary user code",()=>{
  const f=readIssueFields(share);
  assert.equal(f["Invite code"],"PNSMZZ");
  assert.equal(f["Invite limit (optional; self-reported)"],"30");
  assert.equal(f["Uses so far (optional; self-reported)"],"");
  assert.equal(f["Remaining invites (optional; self-reported)"],"");
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
  assert.equal(same.outcome,"needs-review");
  assert.deepEqual(original,[item,sourceOnly]);
  const hijackBody=updatedShare("GitHub (my own code)");
  assert.equal(planIssueChange(issue(70,"[Invite]",hijackBody),original).outcome,"needs-review");
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
  assert.match(attempted.reason,/Threads attribution/);

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
    updatedShare("GitHub (my own code)").replace("18I70N","XX1234"),"sameperson"),[item,...existing]).outcome,"needs-review");
});
