import { planIssueChange, isAutoPublishableNewGithubInvite, AUTO_PUBLISH_NEW_INVITE_MARKER } from "./issue-to-pr.mjs";
import { changedRecord, changedRecords } from "./catalog.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_MERGE_MAINTAINER, AUTO_MERGE_BLOCK_LABEL,
  getMaintainerAuthorization, ciHasPassed, autoMergeDecision,
  qualifiesForDefaultAutoMerge, AUTO_MERGE_DEFAULT_AUTHOR, AUTO_MERGE_MAX_DOC_FILES, verifyNewGithubInvitePR
} from "./auto-merge.mjs";

const HEAD="a".repeat(40);
const NEXT="b".repeat(40);
const at="2026-11-14T00:00:00Z";
const after="2026-11-14T00:01:00Z";
const later="2026-11-14T00:02:00Z";

const cmd=(body,user=AUTO_MERGE_MAINTAINER,when=at,id=1)=>({
  id,body,user:{login:user},created_at:when
});
const review=(state="APPROVED",who=AUTO_MERGE_MAINTAINER,sha=HEAD,when=at,id=5)=>({
  id,user:{login:who},state,commit_id:sha,submitted_at:when
});
const run=(sha=HEAD,conclusion="success",event="pull_request",time=at)=>({
  head_sha:sha,status:"completed",conclusion,event,created_at:time,
  name:"Validate website and invite catalog"
});
const pr=(overrides={})=>({
  state:"open",draft:false,mergeable:true,mergeable_state:"clean",
  base:{ref:"main"},head:{sha:HEAD,repo:{full_name:"ePlus-DEV/muse-invite-hub"}},
  labels:[],...overrides
});

test("maintainer approval of exact HEAD authorizes auto-merge, outsiders never can",()=>{
  assert.equal(getMaintainerAuthorization({headSha:HEAD,reviews:[review()]}).authorized,true);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,comments:[cmd("/automerge "+HEAD)]}).authorized,true);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,comments:[cmd("/automerge "+HEAD,"outsider")]}).authorized,false);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,reviews:[review("APPROVED","outsider")]}).authorized,false);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,comments:[cmd("/automerge")]}).authorized,false);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,comments:[cmd("/automerge "+HEAD.slice(0,7))]}).authorized,false);
});

test("new PR head invalidates approval; a prior change request blocks merge",()=>{
  assert.equal(getMaintainerAuthorization({headSha:NEXT,reviews:[review()]}).authorized,false);
  assert.equal(getMaintainerAuthorization({headSha:NEXT,comments:[cmd("/automerge "+HEAD)]}).authorized,false);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,reviews:[
    review(),review("CHANGES_REQUESTED","other-reviewer",HEAD,after,6)
  ]}).authorized,false);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,reviews:[
    review("CHANGES_REQUESTED","other-reviewer",HEAD,at,6),
    review("APPROVED","other-reviewer",HEAD,after,7),
    review("APPROVED",AUTO_MERGE_MAINTAINER,HEAD,after,8)
  ]}).authorized,true);
});

test("maintainer cancellation revokes previous approval, newer authorization restores it",()=>{
  const initial=cmd("/automerge "+HEAD,AUTO_MERGE_MAINTAINER,at,1);
  const stop=cmd("/automerge off",AUTO_MERGE_MAINTAINER,after,2);
  const again=cmd("/automerge "+HEAD,AUTO_MERGE_MAINTAINER,later,3);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,comments:[initial,stop]}).authorized,false);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,comments:[stop,initial]}).authorized,false);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,comments:[initial,stop,again]}).authorized,true);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,reviews:[review()],comments:[stop]}).authorized,false);
  assert.equal(getMaintainerAuthorization({headSha:HEAD,reviews:[review("APPROVED",AUTO_MERGE_MAINTAINER,HEAD,later)],comments:[stop]}).authorized,true);
});

test("current-head full validation must succeed, fail and action_required never pass",()=>{
  assert.equal(ciHasPassed({headSha:HEAD,runs:[run()]}),true);
  assert.equal(ciHasPassed({headSha:HEAD,runs:[run(NEXT)]}),false);
  assert.equal(ciHasPassed({headSha:HEAD,runs:[run(HEAD,"failure")]}),false);
  assert.equal(ciHasPassed({headSha:HEAD,runs:[run(HEAD,"action_required")]}),false);
  assert.equal(ciHasPassed({headSha:HEAD,runs:[run(HEAD,"success","workflow_dispatch")]}),true);
  assert.equal(ciHasPassed({headSha:HEAD,runs:[run(HEAD,"success","push")]}),false);
  assert.equal(ciHasPassed({headSha:HEAD,runs:[
    run(HEAD,"success","workflow_dispatch",at),
    run(HEAD,"failure","pull_request",after)
  ]}),false);
  assert.equal(ciHasPassed({headSha:HEAD,runs:[
    run(HEAD,"action_required","pull_request",later),
    run(HEAD,"success","workflow_dispatch",after)
  ]}),true);
  assert.equal(ciHasPassed({headSha:HEAD,runs:[
    run(HEAD,"success","workflow_dispatch",at),
    {...run(HEAD,"success","pull_request",after),status:"in_progress",conclusion:null}
  ]}),false);
});

test("never merge drafts, forks, stale branches or blocked PRs",()=>{
  const reviews=[review()],runs=[run()];
  const eligible=autoMergeDecision({pr:pr(),reviews,runs});
  assert.deepEqual(eligible,{eligible:true,sha:HEAD,method:"review"});
  for(const variant of [
    {draft:true},
    {state:"closed"},
    {mergeable:false},
    {mergeable_state:"dirty"},
    {mergeable_state:"behind"},
    {base:{ref:"staging"}},
    {head:{sha:HEAD,repo:{full_name:"someone-else/fork"}}},
    {labels:[{name:AUTO_MERGE_BLOCK_LABEL}]}
  ]){
    const result=autoMergeDecision({pr:pr(variant),reviews,runs});
    assert.equal(result.eligible,false,JSON.stringify(variant));
  }
});

test("new, unreviewed invite Draft PRs stay unmerged even with passing CI",()=>{
  assert.equal(autoMergeDecision({pr:pr({draft:true}),runs:[run()]}).eligible,false);
  assert.equal(autoMergeDecision({pr:pr(),runs:[run()]}).eligible,false);
  assert.equal(autoMergeDecision({pr:pr(),reviews:[review()],runs:[]}).eligible,false);
  assert.equal(autoMergeDecision({pr:pr(),comments:[cmd("/automerge "+HEAD)],runs:[run()]}).eligible,true);
});


const maintainerDocs=(overrides={}) => pr({
  user:{login:AUTO_MERGE_DEFAULT_AUTHOR},
  changed_files:1,
  ...overrides
});
const mdFile=(filename="README.md",status="modified")=>({filename,status});

test("trusted maintainer docs-only PRs are default-on after green CI",()=>{
  assert.equal(qualifiesForDefaultAutoMerge(maintainerDocs(),[mdFile()]),true);
  assert.deepEqual(autoMergeDecision({
    pr:maintainerDocs(),
    files:[mdFile()],runs:[run()]
  }),{eligible:true,sha:HEAD,method:"default-safe-docs"});
  assert.equal(autoMergeDecision({
    pr:maintainerDocs({changed_files:3}),
    files:[mdFile("README.md"),mdFile("CONTRIBUTING.md"),mdFile("docs/operations/notes.md")],
    runs:[run()]
  }).method,"default-safe-docs");
});

test("default docs policy never covers community submissions or executable changes",()=>{
  const safe=[mdFile("README.md")];
  assert.equal(qualifiesForDefaultAutoMerge(
    maintainerDocs({user:{login:"github-actions[bot]"}}),safe),false);
  assert.equal(qualifiesForDefaultAutoMerge(
    maintainerDocs({user:{login:"another-collaborator"}}),safe),false);
  for (const unsafe of [
    "data/invite-records/community-issue-113.json","assets/app.js",
    ".github/workflows/validate.yml","AGENTS.md","package.json",
    "scripts/issue-to-pr.mjs","docs/start.html","docs/../README.md",
    "docs/hidden.yaml","README.md/evil","CODEOWNERS",
    ".github/ISSUE_TEMPLATE/share-code.yml"
  ]) {
    const mixed=maintainerDocs({changed_files:2});
    assert.equal(qualifiesForDefaultAutoMerge(
      mixed,[mdFile("README.md"),mdFile(unsafe)]),false,unsafe);
  }
  assert.equal(qualifiesForDefaultAutoMerge(
    maintainerDocs({changed_files:2}),[mdFile("README.md")]),false);
  assert.equal(qualifiesForDefaultAutoMerge(
    maintainerDocs({changed_files:0}),[]),false);
  assert.equal(qualifiesForDefaultAutoMerge(
    maintainerDocs({changed_files:AUTO_MERGE_MAX_DOC_FILES+1}),
    Array.from({length:AUTO_MERGE_MAX_DOC_FILES+1},()=>mdFile())),false);
  assert.equal(qualifiesForDefaultAutoMerge(
    maintainerDocs(),[mdFile("README.md","removed")]),false);
  assert.equal(qualifiesForDefaultAutoMerge(
    maintainerDocs(),[{...mdFile(),previous_filename:"old.md"}]),false);
  assert.equal(autoMergeDecision({
    pr:pr({user:{login:"someone-else"},changed_files:1}),
    files:safe,runs:[run()]
  }).eligible,false);
});

test("draft, do-not-merge, CI failure, and reviewer objections block safe docs",()=>{
  const files=[mdFile()];
  for (const props of [{draft:true},{labels:[{name:"do-not-merge"}]},
                      {mergeable:false},{mergeable_state:"behind"}]) {
    assert.equal(autoMergeDecision({
      pr:maintainerDocs(props),files,runs:[run()]
    }).eligible,false);
  }
  assert.equal(autoMergeDecision({
    pr:maintainerDocs(),files,runs:[run(HEAD,"failure")]
  }).eligible,false);
  assert.equal(autoMergeDecision({
    pr:maintainerDocs(),files,reviews:[review("CHANGES_REQUESTED","reviewer")],runs:[run()]
  }).eligible,false);
  assert.equal(autoMergeDecision({
    pr:maintainerDocs(),files,
    comments:[cmd("/automerge off")],runs:[run()]
  }).eligible,false);
  assert.equal(autoMergeDecision({
    pr:maintainerDocs(),files,
    comments:[cmd("/automerge off",AUTO_MERGE_MAINTAINER,at,1),
              cmd("/automerge "+HEAD,AUTO_MERGE_MAINTAINER,after,2)],
    runs:[run()]
  }).eligible,true);
});


const existingCatalog=[{
  id:"eplus-owner-dpnihh",code:"DPNIHH",status:"unverified",
  addedAt:"2026-11-10",submittedBy:"hoangsvit",
  featured:true,ownerConfirmed:true
}];

const newCodeIssue=(codes="PNSMZZ",source="GitHub (my own code)")=>({
  number:230,title:"[Invite] sample",state:"open",
  user:{login:"real-contributor",id:12345,type:"User"},
  created_at:"2026-11-14T09:00:00Z",
  updated_at:"2026-11-15T10:00:00Z", // bot comments do not change addedAt
  body:[
    "### Invite code","",codes,"",
    "### Code source","",source,"",
    "### Public confirmation or context (optional)","","_No response_","",
    "### Contributor checklist","",
    "- [x] I own this public code or am reporting a code explicitly shared publicly at the source URL above; this issue is public.",
    "- [x] This code is not a password, 2FA code, session token or private credential."
  ].join("\n")
});

function botProposal(issue=newCodeIssue(),catalog=existingCatalog){
  const plan=planIssueChange(issue,catalog);
  if(plan.outcome !== "proposal") throw Error("Expected proposal");
  const codes=plan.codes || [plan.code];
  const records=codes.length===1
    ? [changedRecord(catalog,plan.data,codes[0])]
    : changedRecords(catalog,plan.data,codes);
  const files=records.map(r=>({filename:r.path,status:"added"}));
  const fileContents=Object.fromEntries(records.map(r=>[r.path,r.content]));
  const botPr=pr({
    user:{login:"github-actions[bot]"},
    head:{sha:HEAD,ref:"auto/issue-"+issue.number+"-invite",
      repo:{full_name:"ePlus-DEV/muse-invite-hub"}},
    title:"data: review "+codes.join(", ")+" invite (issue #"+issue.number+")",
    body:AUTO_PUBLISH_NEW_INVITE_MARKER,
    changed_files:records.length
  });
  return {issue,files,fileContents,pr:botPr,catalog};
}

test("new GitHub-owned Issue can auto-publish only as unverified",()=>{
  const data=botProposal();
  const p=planIssueChange(data.issue,data.catalog);
  assert.equal(isAutoPublishableNewGithubInvite(data.issue,p),true);
  assert.equal(p.data.find(i=>i.code==="PNSMZZ").status,"unverified");
  assert.equal(p.data.find(i=>i.code==="PNSMZZ").addedAt,"2026-11-14");
  assert.equal(verifyNewGithubInvitePR(data),true);
  const d=autoMergeDecision({
    pr:data.pr,files:data.files,newInviteEligible:verifyNewGithubInvitePR(data),
    runs:[run()]
  });
  assert.deepEqual(d,{eligible:true,sha:HEAD,method:"verified-new-github-invite"});
  assert.equal(autoMergeDecision({pr:data.pr,files:data.files,runs:[run()]}).eligible,false);
});

test("one Issue may auto-publish independently validated multiple new codes",()=>{
  const data=botProposal(newCodeIssue("ABC123, DEF456, 11ZKLM"));
  assert.equal(data.files.length,3);
  assert.equal(verifyNewGithubInvitePR(data),true);
  assert.equal(autoMergeDecision({
    pr:data.pr,files:data.files,newInviteEligible:true,runs:[run()]
  }).method,"verified-new-github-invite");
});

test("existing, social, missing-consent or edited Issues cannot trigger auto-publish",()=>{
  const d=botProposal();
  const cases=[
    {...d.issue,body:d.issue.body.replace("GitHub (my own code)","Threads (public code I found)")},
    {...d.issue,body:d.issue.body.replace("- [x] This code is not a password","- [ ] This code is not a password")},
    {...d.issue,body:d.issue.body.replace("PNSMZZ","NEW777")},
    {...d.issue,state:"closed"},
    {...d.issue,number:234}
  ];
  for(const issue of cases){
    assert.equal(verifyNewGithubInvitePR({...d,issue}),false);
  }
  const duplicate=[...existingCatalog,{
    id:"already-there",code:"PNSMZZ",status:"unverified",
    addedAt:"2026-11-10",submittedBy:"someone"
  }];
  assert.equal(verifyNewGithubInvitePR({...d,catalog:duplicate}),false);
});

test("untrusted PR metadata and modified records cannot spoof automated bot source",()=>{
  const d=botProposal();
  const broken=[
    {pr:{...d.pr,user:{login:"attacker"}}},
    {pr:{...d.pr,body:"no trusted marker"}},
    {pr:{...d.pr,head:{...d.pr.head,ref:"not-the-bot-branch"}}},
    {pr:{...d.pr,title:"data: review another invite (issue #230)"}},
    {pr:{...d.pr,changed_files:2}},
    {files:[{...d.files[0],status:"modified"}]},
    {files:[...d.files,{filename:".github/workflows/hijack.yml",status:"added"}]},
    {fileContents:{[d.files[0].filename]:d.fileContents[d.files[0].filename].replace('"status": "unverified"','"status": "reported-working"')}},
    {fileContents:{[d.files[0].filename]:d.fileContents[d.files[0].filename].replace('"submittedBy": "real-contributor"','"submittedBy": "attacker"')}}
  ];
  for(const changes of broken) {
    assert.equal(verifyNewGithubInvitePR({...d,...changes}),false,JSON.stringify(changes).slice(0,100));
  }
});

test("unverified auto-publish still obeys all global stop conditions",()=>{
  const d=botProposal();
  for(const p of [
    {...d.pr,draft:true},
    {...d.pr,mergeable:false},
    {...d.pr,labels:[{name:"do-not-merge"}]},
    {...d.pr,mergeable_state:"behind"}
  ]){
    assert.equal(autoMergeDecision({pr:p,files:d.files,newInviteEligible:true,runs:[run()]}).eligible,false);
  }
  assert.equal(autoMergeDecision({
    pr:d.pr,files:d.files,newInviteEligible:true,runs:[run(HEAD,"failure")]
  }).eligible,false);
  assert.equal(autoMergeDecision({
    pr:d.pr,files:d.files,newInviteEligible:true,runs:[run()],
    reviews:[review("CHANGES_REQUESTED","another-reviewer")]
  }).eligible,false);
  assert.equal(autoMergeDecision({
    pr:d.pr,files:d.files,newInviteEligible:true,runs:[run()],
    comments:[cmd("/automerge off")]
  }).eligible,false);
});
