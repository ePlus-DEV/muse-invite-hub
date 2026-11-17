import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import {
  ledgerPath,parseReviewableFeedback,validateFeedbackLedger,
  addReviewedFeedback,summarizeApprovedFeedback,readReviewedFeedback,
  validateFeedbackDirectory
} from "./feedback-ledger.mjs";

const issue={number:14,title:"[Invite] DPNIHH",state:"closed",
  body:"### Invite code\n\nDPNIHH\n\n### Code source\n\nGitHub"};
const code={id:"owner",code:"DPNIHH",feedbackIssueNumber:14,addedAt:"2026-11-11"};
const approved={code:"DPNIHH",issueNumber:14,commentId:501,
  userId:101,recordedAt:"2026-11-17T09:00:00.000Z",outcome:"worked"};
const comment=(body,options={})=>({
  id:501,created_at:"2026-11-17T09:00:00.000Z",
  issue_url:"https://api.github.com/repos/ePlus-DEV/muse-invite-hub/issues/14",
  user:{login:"community-member",type:"User",id:101},body,...options
});
const worked="Code: DPNIHH\nResult: Muse accepted my code\nWhen I tried: 2026-11-17";
const failed="Code: DPNIHH\nResult: Muse rejected or could not redeem my code";

test("only comments on the original Issue from real GitHub humans can propose review",()=>{
  assert.deepEqual(parseReviewableFeedback(issue,comment(worked),[code]),approved);
  const invalid=[
    comment(worked,{id:0}),comment(worked,{user:{id:42,type:"Bot",login:"x[bot]"}}),
    comment(worked,{user:{id:42,type:"User",login:"eplus-bot"}}),
    comment(worked,{issue_url:"https://api.github.com/repos/ePlus-DEV/muse-invite-hub/issues/99"}),
    comment(worked.replace("DPNIHH","OTHER1")),
    comment("Informal text\n"+worked),
    comment(worked,{created_at:"not-a-date"}),
    comment("Code: DPNIHH\nResult: not a recognized outcome")
  ];
  for(const msg of invalid) assert.equal(parseReviewableFeedback(issue,msg,[code]),null);
  assert.equal(parseReviewableFeedback({...issue,number:15},comment(worked),[code]),null);
  assert.equal(parseReviewableFeedback({...issue,pull_request:{}},comment(worked),[code]),null);
  assert.equal(parseReviewableFeedback(issue,comment(worked),[{...code,feedbackIssueNumber:99}]),null);
});

test("a merged JSON stores per-user history, one contribution per account",()=>{
  const first=addReviewedFeedback(null,approved);
  assert.equal(first.changed,true);
  assert.deepEqual(Object.keys(first.ledger.users),["101"]);
  assert.equal(first.ledger.users["101"].outcome,"worked");
  assert.equal(addReviewedFeedback(first.ledger,approved).changed,false);
  const another=addReviewedFeedback(first.ledger,{...approved,commentId:502,userId:102,outcome:"worked"});
  const revision=addReviewedFeedback(another.ledger,{...approved,commentId:503,
    recordedAt:"2026-11-17T10:00:00.000Z",outcome:"failed"});
  assert.equal(revision.changed,true);
  assert.deepEqual(summarizeApprovedFeedback([code],()=>revision.ledger,
    "2026-11-17T12:00:00Z").codes.DPNIHH,{worked:1,failed:1});
  assert.equal(addReviewedFeedback(revision.ledger,approved).reason,"older-report");
  assert.equal(first.ledger.users["101"].outcome,"worked","updating must not mutate previous JSON");
  assert.deepEqual(addReviewedFeedback(revision.ledger,{...approved,
    commentId:501,recordedAt:"2026-11-17T10:00:00.000Z"}).changed,false);
});

test("counts are deterministic, absent ledgers are zero only when read succeeded",()=>{
  const summary=summarizeApprovedFeedback([code,{code:"EMPTY1",feedbackIssueNumber:20}],
    code=>code==="DPNIHH" ? addReviewedFeedback(null,approved).ledger:null,
    "2026-11-17T12:00:00Z");
  assert.equal(summary.source,"reviewed-github-feedback");
  assert.deepEqual(summary.codes.DPNIHH,{worked:1,failed:0});
  assert.deepEqual(summary.codes.EMPTY1,{worked:0,failed:0});
  assert.equal(JSON.stringify(summary).includes('"users"'),false,
    "only aggregate totals are published to visitors");
});

test("invalid ledgers fail closed instead of silently losing approved feedback",()=>{
  const ledger=addReviewedFeedback(null,approved).ledger;
  for(const wrong of [
    {...ledger,code:"OTHER1"},
    {...ledger,users:{"__not-an-id__":{...ledger.users["101"]}}},
    {...ledger,users:{"101":{...ledger.users["101"],outcome:"invented"}}},
    {...ledger,users:{"101":{...ledger.users["101"],commentId:0}}},
    {...ledger,extra:true}
  ]) assert.throws(()=>validateFeedbackLedger(wrong,"DPNIHH"));
  assert.throws(()=>summarizeApprovedFeedback([code],
    ()=>({...ledger,users:{"101":{...ledger.users["101"],issueNumber:99}}}),
    "2026-11-17T12:00:00Z"),/canonical issue/);
  assert.throws(()=>summarizeApprovedFeedback([code],()=>ledger,"invalid"));
});

test("approved feedback survives across builds in repository JSON",()=>{
  const root=mkdtempSync(join(tmpdir(),"muse-review-ledger-"));
  try {
    mkdirSync(join(root,"feedback-stats"));
    const ledger=addReviewedFeedback(null,approved).ledger;
    writeFileSync(join(root,ledgerPath("DPNIHH")),JSON.stringify(ledger,null,2));
    assert.deepEqual(readReviewedFeedback("DPNIHH",root),ledger);
    assert.equal(readReviewedFeedback("EMPTY1",root),null);
    assert.doesNotThrow(()=>validateFeedbackDirectory(root));
    writeFileSync(join(root,"feedback-stats","bad-name.json"),"{}");
    assert.throws(()=>validateFeedbackDirectory(root),/Invalid feedback ledger filename/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test("trusted builds read local persisted JSON, never recount GitHub comments",()=>{
  const builder=readFileSync(new URL("./build-pages.mjs",import.meta.url),"utf8");
  const proposer=readFileSync(new URL("./feedback-comment-to-pr.mjs",import.meta.url),"utf8");
  assert.match(builder,/summarizeApprovedFeedback/);
  assert.match(builder,/readReviewedFeedback/);
  assert.doesNotMatch(builder,/issues\/comments\?per_page=100/);
  assert.match(proposer,/const updated=addReviewedFeedback\(previous,mainReport\)/);
  assert.match(proposer,/await addFile\(path,JSON\.stringify\(updated\.ledger/);
  assert.match(proposer,/draft:true/);
});
