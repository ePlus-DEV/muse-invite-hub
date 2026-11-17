import { planIssueChange, isAutoPublishableNewGithubInvite, isAutoPublishableNewSocialInvite, AUTO_PUBLISH_NEW_INVITE_MARKER, AUTO_PUBLISH_NEW_SOCIAL_INVITE_MARKER } from "./issue-to-pr.mjs";
import { changedRecord, changedRecords } from "./catalog.mjs";
import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  AUTO_MERGE_MAINTAINER, AUTO_MERGE_BLOCK_LABEL,
  getMaintainerAuthorization, ciHasPassed, autoMergeDecision,
  qualifiesForDefaultAutoMerge, AUTO_MERGE_DEFAULT_AUTHOR, AUTO_MERGE_MAX_DOC_FILES, verifyNewGithubInvitePR, verifyNewSocialInvitePR, needsEplusBotReview,
  isTransientMergeError, confirmedMergeAfterError, shouldDispatchPagesRecovery, dispatchBotValidation
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

test("bot-authored new Issue PR uses full trusted gate without self-review",()=>{
  const data=botProposal();
  const authored={...data.pr,user:{login:"eplus-bot"}};
  const checked={...data,pr:authored};
  assert.equal(verifyNewGithubInvitePR(checked),true);
  const decision=autoMergeDecision({
    pr:authored,files:data.files,newInviteEligible:verifyNewGithubInvitePR(checked),
    runs:[run()]
  });
  assert.equal(decision.eligible,true);
  assert.equal(decision.method,"verified-new-github-invite");
  assert.equal(needsEplusBotReview({
    pr:authored,files:data.files,newInviteEligible:true,runs:[run()]
  }).required,false,"eplus-bot cannot approve a PR authored by eplus-bot");
  const fake={...authored,user:{login:"outsider"}};
  assert.equal(verifyNewGithubInvitePR({...checked,pr:fake}),false);
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

test("ePlus Bot is a workflow name, not a separate App or a forged approval",()=>{
  const verified=botProposal();
  assert.deepEqual(autoMergeDecision({
    pr:{...verified.pr,mergeable_state:"unstable"},
    files:verified.files,newInviteEligible:verifyNewGithubInvitePR(verified),
    runs:[run()]
  }),{eligible:true,sha:HEAD,method:"verified-new-github-invite"});
  const unverified={...verified.pr,mergeable_state:"unstable"};
  assert.equal(autoMergeDecision({
    pr:unverified,files:verified.files,runs:[run()]
  }).eligible,false,"unstable status never bypasses independent Issue verification");
  const arbitrary=pr({mergeable_state:"unstable",user:{login:"hoangsvit"},changed_files:1});
  assert.equal(autoMergeDecision({
    pr:arbitrary,files:[mdFile("README.md")],runs:[run()]
  }).eligible,false,"docs must still be clean, even if otherwise default-safe");
  assert.equal(autoMergeDecision({
    pr:{...verified.pr,mergeable_state:"dirty"},
    files:verified.files,newInviteEligible:true,runs:[run()]
  }).eligible,false);
  assert.equal(autoMergeDecision({
    pr:{...verified.pr,mergeable_state:"unstable"},files:verified.files,
    newInviteEligible:true,runs:[run()],
    comments:[cmd("/automerge off")]
  }).eligible,false);
  assert.equal(autoMergeDecision({
    pr:{...verified.pr,mergeable_state:"unstable"},files:verified.files,
    newInviteEligible:true,runs:[run(HEAD,"failure")]
  }).eligible,false);
});


test("real eplus-bot only reviews verified new GitHub invite PR head",()=>{
  const data=botProposal();
  const eligible={pr:{...data.pr,mergeable_state:"unstable"},
    files:data.files,newInviteEligible:verifyNewGithubInvitePR(data),runs:[run()]};
  assert.deepEqual(needsEplusBotReview(eligible),{required:true,sha:HEAD});
  assert.equal(needsEplusBotReview({...eligible,
    reviews:[review("APPROVED","eplus-bot",HEAD)]}).required,false);
  assert.equal(needsEplusBotReview({...eligible,
    reviews:[review("APPROVED","eplus-bot",NEXT)]}).required,true);
  assert.equal(needsEplusBotReview({...eligible,
    reviews:[review("CHANGES_REQUESTED","reviewer")]}).required,false);
  for(const changes of [
    {newInviteEligible:false},
    {runs:[run(HEAD,"failure")]},
    {pr:{...data.pr,draft:true}},
    {pr:{...data.pr,user:{login:"eplus-bot"}}},
    {pr:{...data.pr,mergeable_state:"dirty"}},
    {pr:{...data.pr,labels:[{name:"do-not-merge"}]}}
  ]) assert.equal(needsEplusBotReview({...eligible,...changes}).required,false,
    JSON.stringify(changes));
  assert.equal(needsEplusBotReview({...eligible,
    comments:[cmd("/automerge off")]}).required,false);
  assert.equal(needsEplusBotReview({
    pr:pr({user:{login:"developer"},changed_files:1}),
    files:[mdFile("scripts/main.mjs")],
    newInviteEligible:false,runs:[run()]
  }).required,false,"passing CI never auto-approves arbitrary code PRs");
});


test("actual eplus-bot credential and exact-head review are wired safely",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/auto-merge.yml",import.meta.url),"utf8");
  const manual=readFileSync(new URL("../.github/workflows/eplus-bot-review-command.yml",import.meta.url),"utf8");
  assert.match(workflow,/EPLUS_BOT_TOKEN: \$\{\{ secrets\.EPLUS_BOT_TOKEN \}\}/);
  const proposer=readFileSync(new URL("../.github/workflows/issue-to-pr.yml",import.meta.url),"utf8");
  assert.match(proposer,/GH_TOKEN: \$\{\{ secrets\.EPLUS_BOT_TOKEN \}\}/);
  assert.match(proposer,/gh api user --jq \.login/);
  assert.doesNotMatch(proposer,/GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow,/identity\.json\(\)\)\.login!=="eplus-bot"/);
  assert.match(workflow,/event:"APPROVE",commit_id:decision\.sha/);
  assert.match(workflow,/reviewGate\.required/);
  assert.match(workflow,/sourceIssueUpdatedAt/);
  assert.doesNotMatch(workflow,/EPLUS_REVIEW_BOT_CLIENT_ID|EPLUS_REVIEW_BOT_PRIVATE_KEY/);
  assert.match(manual,/github\.event\.comment\.body == '@eplus-bot review'/);
  assert.match(manual,/test "\$AUTHOR" != "eplus-bot"/);
  assert.match(manual,/\.head\.sha == \$sha/);
  assert.match(manual,/\.status == "completed" and \.conclusion == "success"/);
  assert.match(manual,/secrets\.EPLUS_BOT_TOKEN/);
  assert.doesNotMatch(manual,/actions\/checkout/);
});


test("eplus-bot CI dispatch wakes the trusted merge gate after branch synchronization",async()=>{
  const workflow=readFileSync(new URL("../.github/workflows/auto-merge.yml",import.meta.url),"utf8");
  assert.match(workflow,/await dispatchBotValidation\(/);
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow,/workflow_id:"validate\.yml"/,
    "retain a safe GITHUB_TOKEN fallback for validation");

  const calls=[];
  const request=async(url,opts)=>{
    calls.push({url,opts});
    if(url==="https://api.github.com/user")return {
      ok:true,json:async()=>({login:"eplus-bot"})
    };
    return {status:204};
  };
  await dispatchBotValidation({
    branch:"auto/issue-265-invite",token:"FAKE_TOKEN",request
  });
  assert.equal(calls.length,2);
  assert.equal(calls[0].opts.headers.Authorization,"Bearer FAKE_TOKEN");
  assert.equal(calls[1].url,"https://api.github.com/repos/ePlus-DEV/muse-invite-hub/actions/workflows/validate.yml/dispatches");
  assert.equal(calls[1].opts.method,"POST");
  assert.deepEqual(JSON.parse(calls[1].opts.body),{ref:"auto/issue-265-invite"});

  for(const branch of ["main","fix/unrelated","auto/issue-265-count","auto/issue-0-invite"]){
    await assert.rejects(dispatchBotValidation({branch,token:"FAKE_TOKEN",request}),/trusted repo/);
  }
  await assert.rejects(dispatchBotValidation({
    repository:"someone/else",branch:"auto/issue-265-invite",token:"FAKE_TOKEN",request
  }),/trusted repo/);
  await assert.rejects(dispatchBotValidation({
    branch:"auto/issue-265-invite",token:"",request
  }),/trusted repo/);
  assert.equal(calls.length,2,"invalid inputs never contact GitHub");

  const wrongBot=async()=>({ok:true,json:async()=>({login:"not-the-bot"})});
  await assert.rejects(dispatchBotValidation({
    branch:"auto/issue-265-invite",token:"FAKE_TOKEN",request:wrongBot
  }),/authenticated eplus-bot/);
  let attempts=0;
  const failure=async(url)=>{
    attempts++;
    if(url.endsWith("/user"))return {ok:true,json:async()=>({login:"eplus-bot"})};
    return {status:503};
  };
  await assert.rejects(dispatchBotValidation({
    branch:"auto/issue-265-invite",token:"FAKE_TOKEN",request:failure
  }),/HTTP 503/);
  assert.equal(attempts,2);
});

test("strict social new-code PR verifier keeps attribution unverified but permits publication",()=>{
  const issue=newCodeIssue("BM69LI","X (Twitter) (public code I found)");
  issue.body=issue.body.replace("### Public confirmation or context (optional)",
    "### Social post or profile URL (required for Threads, X or Facebook)\n\n"+
    "https://x.com/xiyaodao/status/2121891507309314522\n\n"+
    "### Public confirmation or context (optional)");
  const data=botProposal(issue);
  data.pr.body=AUTO_PUBLISH_NEW_SOCIAL_INVITE_MARKER;
  data.pr.user={login:"eplus-bot"};
  assert.equal(isAutoPublishableNewSocialInvite(issue,planIssueChange(issue,existingCatalog)),true);
  assert.equal(verifyNewSocialInvitePR(data),true);
  assert.equal(verifyNewGithubInvitePR(data),false);
  assert.equal(needsEplusBotReview({...data,newInviteEligible:true,runs:[run()]}).required,false);
  assert.equal(autoMergeDecision({
    pr:data.pr,files:data.files,newInviteEligible:verifyNewSocialInvitePR(data),runs:[run()]
  }).eligible,true);
  const tampered={...data,fileContents:{...data.fileContents,
    [data.files[0].filename]:data.fileContents[data.files[0].filename].replace(
      '"status": "unverified"','"status": "reported-working"')}};
  assert.equal(verifyNewSocialInvitePR(tampered),false);
  const spoof={...data,pr:{...data.pr,body:AUTO_PUBLISH_NEW_INVITE_MARKER}};
  assert.equal(verifyNewSocialInvitePR(spoof),false);
  const foreign={...data,issue:{...issue,
    body:issue.body.replace("x.com/xiyaodao/status/2121891507309314522","x.com/other/status/2121891507309314522")}};
  assert.equal(verifyNewSocialInvitePR(foreign),false);
  assert.equal(autoMergeDecision({pr:data.pr,files:data.files,
    newInviteEligible:true,runs:[run(HEAD,"failure")]}).eligible,false);
});

test("transient GitHub merge 502 requires confirmed server-side merge before dispatch",()=>{
  for (const status of [500,502,503,504]) assert.equal(isTransientMergeError(status),true);
  for (const status of [403,405,409,422,null]) assert.equal(isTransientMergeError(status),false);
  const merged={merged:true,head:{sha:HEAD},base:{ref:"main"},merge_commit_sha:NEXT};
  assert.equal(confirmedMergeAfterError(merged,HEAD),true);
  assert.equal(confirmedMergeAfterError({...merged,merged:false},HEAD),false);
  assert.equal(confirmedMergeAfterError({...merged,head:{sha:NEXT}},HEAD),false);
  assert.equal(confirmedMergeAfterError({...merged,base:{ref:"staging"}},HEAD),false);
  assert.equal(confirmedMergeAfterError({...merged,merge_commit_sha:null},HEAD),false);
});

test("scheduled Pages recovery dispatches only when main lacks a recent or successful deploy",()=>{
  const now=Date.parse("2026-11-16T18:00:00Z");
  const old="2026-11-16T17:45:00Z", recent="2026-11-16T17:59:00Z";
  const result=(conclusion,status="completed",created_at=old)=>({conclusion,status,created_at});
  assert.equal(shouldDispatchPagesRecovery([],now),true);
  assert.equal(shouldDispatchPagesRecovery([result("failure")],now),true);
  assert.equal(shouldDispatchPagesRecovery([result("skipped")],now),true);
  assert.equal(shouldDispatchPagesRecovery([result("failure","completed",recent)],now),false);
  assert.equal(shouldDispatchPagesRecovery([result(null,"queued")],now),false);
  assert.equal(shouldDispatchPagesRecovery([result(null,"in_progress")],now),false);
  assert.equal(shouldDispatchPagesRecovery([result("success"),result("failure")],now),false);
  assert.equal(shouldDispatchPagesRecovery(null,now),false);
});
