import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planCommentProposal } from "./feedback-comment-to-pr.mjs";

const item={id:"eplus-owner-dpnihh",code:"DPNIHH",status:"unverified",
  addedAt:"2026-11-11",submittedBy:"hoangsvit",featured:true,ownerConfirmed:true,
  feedbackIssueNumber:14};
const community={id:"community-issue-55",code:"IY56PP",status:"unverified",
  addedAt:"2026-11-11",submittedBy:"ruochen-li",submittedById:341934512,
  feedbackIssueNumber:55};
const issue={number:14,title:"[Count update]",state:"closed",
  body:"### Invite code\n\nDPNIHH\n\n### Remaining invites shown by Muse\n\n3"};
const member=(body,options={})=>({
  id:1025,body,created_at:"2026-11-12T11:00:00Z",
  user:{login:"member",id:98765,type:"User"},...options
});
const worked="Code: DPNIHH\nResult: Muse accepted my code\nWhen I tried: 2026-11-12\nDetails: It worked.";
const ownerCount="Code: DPNIHH\nUpdate type: Owner count\nRemaining invites: 3\nTotal invites: 30\nUsed invites: 27\nOwner confirmation: I confirm these figures came from my own Muse invite screen.";

test("structured community comment creates a review-only feedback proposal using existing Issue",()=>{
  const p=planCommentProposal(issue,member(worked),[item]);
  assert.equal(p.outcome,"proposal");
  assert.equal(p.kind,"feedback");
  assert.equal(p.code,"DPNIHH");
  assert.equal(p.issueNumber,14);
  assert.equal(p.commentId,1025);
  assert.equal(p.branch,"auto/comment-14-1025-feedback");
  assert.equal(p.data[0].status,"reported-working");
  assert.equal(p.data[0].checkedAt,"2026-11-12");
  assert.equal(p.data[0].feedbackIssueNumber,14);
});

test("informal comments, mismatched codes, bots, issue hijacks and unrelated Issues are ignored",()=>{
  for(const comment of [
    member("Looks nice"),member(worked.replace("DPNIHH","OTHER1")),
    member(worked,{user:{login:"github-actions[bot]",type:"Bot"}}),
    member(worked,{id:0}),member(""),
  ]) assert.equal(planCommentProposal(issue,comment,[item]).outcome,"ignored");
  assert.equal(planCommentProposal({...issue,number:16},member(worked),[item]).outcome,"ignored");
  assert.equal(planCommentProposal({...issue,pull_request:{}},member(worked),[item]).outcome,"ignored");
});

test("negative report on featured owner code is held for maintainer review",()=>{
  const comment=member("Code: DPNIHH\nResult: Muse rejected or could not redeem my code");
  const p=planCommentProposal(issue,comment,[item]);
  assert.equal(p.outcome,"needs-review");
  assert.match(p.reason,/featured owner code/);
});

test("old comments cannot overwrite a newer dated catalog check",()=>{
  const newer={...item,checkedAt:"2026-11-13"};
  const p=planCommentProposal(issue,member(worked),[newer]);
  assert.equal(p.outcome,"needs-review");
  assert.match(p.reason,/older than/);
});

test("only actual listed GitHub owner can propose quota update via original Issue",()=>{
  const author={login:"hoangsvit",type:"User",id:124};
  const p=planCommentProposal(issue,member(ownerCount,{user:author}),[item]);
  assert.equal(p.outcome,"proposal");
  assert.equal(p.kind,"count");
  assert.equal(p.branch,"auto/comment-14-1025-count");
  assert.equal(p.data[0].reportedCapacity,30);
  assert.equal(p.data[0].reportedUses,27);
  assert.equal(p.data[0].feedbackIssueNumber,14);
  const stranger=planCommentProposal(issue,member(ownerCount),[item]);
  assert.equal(stranger.outcome,"needs-review");
  assert.match(stranger.reason,/cataloged code owner/);
});

test("owner count requires an explicit confirmation and numeric input",()=>{
  const author={login:"hoangsvit",type:"User",id:124};
  const missing=planCommentProposal(issue,member(
    ownerCount.replace("Owner confirmation: I confirm these figures came from my own Muse invite screen.",
      "Owner confirmation: [confirm this report below]"),{user:author}),[item]);
  assert.equal(missing.outcome,"needs-review");
  assert.match(missing.reason,/confirmation/);
  const invalid=planCommentProposal(issue,member(
    ownerCount.replace("Remaining invites: 3","Remaining invites: many"),{user:author}),[item]);
  assert.equal(invalid.outcome,"needs-review");
  assert.match(invalid.reason,/integer/);
});

test("social-source owner update cannot be automatically proposed by GitHub commenter",()=>{
  const social={id:"social",code:"SOCIAL1",status:"unverified",addedAt:"2026-11-11",
    sourceUrl:"https://www.threads.com/@person/post/abcde",feedbackIssueNumber:70};
  const root={number:70,state:"closed",title:"[Code discussion] SOCIAL1",
    body:"<!-- muse-code-feedback-root:SOCIAL1 -->"};
  const p=planCommentProposal(root,member(ownerCount.replaceAll("DPNIHH","SOCIAL1"),
    {user:{login:"person",type:"User",id:123}}),[social]);
  assert.equal(p.outcome,"needs-review");
  assert.match(p.reason,/Social attribution/);
});

test("contributor with stable GitHub ID may report usage of original code",()=>{
  const root={number:55,state:"closed",title:"[Invite] IY56PP",
    body:"### Invite code\n\nIY56PP"};
  const body=ownerCount.replaceAll("DPNIHH","IY56PP").replace(
    "Remaining invites: 3","Remaining invites: 21").replace(
    "Used invites: 27","Used invites: 9");
  const p=planCommentProposal(root,member(body,{user:{login:"ruochen-li",id:341934512,type:"User"}}),[community]);
  assert.equal(p.outcome,"proposal");
  assert.equal(p.data[0].reportedUses,9);
});

test("trusted Issue action never posts an unverified result directly to the catalog",()=>{
  const code=readFileSync(new URL("./feedback-comment-to-pr.mjs",import.meta.url),"utf8");
  const flow=readFileSync(new URL("../.github/workflows/reopen-code-feedback.yml",import.meta.url),"utf8");
  assert.match(code,/draft:true/);
  assert.match(code,/mainSha/);
  assert.match(code,/planIssueChange\(synthetic,catalog\)/);
  assert.match(code,/auto\/comment-/);
  assert.match(code,/A maintainer must approve it before any website status changes/);
  assert.match(flow,/issue_comment:/);
  assert.match(flow,/types: \[created\]/);
  assert.match(flow,/run: node scripts\/reopen-code-feedback\.mjs/);
  assert.match(flow,/run: node scripts\/feedback-comment-to-pr\.mjs/);
});
