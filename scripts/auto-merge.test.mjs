import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_MERGE_MAINTAINER, AUTO_MERGE_BLOCK_LABEL,
  getMaintainerAuthorization, ciHasPassed, autoMergeDecision,
  qualifiesForDefaultAutoMerge, AUTO_MERGE_DEFAULT_AUTHOR, AUTO_MERGE_MAX_DOC_FILES
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
