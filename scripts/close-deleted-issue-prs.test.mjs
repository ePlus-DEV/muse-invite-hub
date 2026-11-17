import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  automatedSourceIssueNumber, deletedSourceConfirmed, deletionNotice
} from "./close-deleted-issue-prs.mjs";

const generated = (overrides = {}) => ({
  state:"open",merged_at:null,
  user:{login:"eplus-bot"},
  head:{ref:"auto/issue-235-invite",repo:{full_name:"ePlus-DEV/muse-invite-hub"}},
  base:{ref:"main"},
  title:"data: review ABC123 invite (issue #235)",
  body:"Code: ABC123.\nTracks Issue #235. The Issue is closed only after publication.",
  ...overrides
});

test("PR #236: only the exact bot-authored data PR is linked to deleted Issue #235", () => {
  assert.equal(automatedSourceIssueNumber(generated()),235);
  assert.equal(automatedSourceIssueNumber(generated({draft:false})),235);
  assert.equal(automatedSourceIssueNumber(generated({
    head:{ref:"auto/issue-235-count",repo:{full_name:"ePlus-DEV/muse-invite-hub"}},
    title:"data: review ABC123 count (issue #235)"
  })),235);
  assert.equal(automatedSourceIssueNumber(generated({
    head:{ref:"auto/issue-235-feedback",repo:{full_name:"ePlus-DEV/muse-invite-hub"}},
    title:"data: review ABC123 feedback (issue #235)"
  })),235);
});

test("do not touch unrelated, user-authored, cross-repo or merged PRs", () => {
  for(const pr of [
    generated({user:{login:"hoangsvit"}}),
    generated({user:{login:"unknown-bot"}}),
    generated({base:{ref:"staging"}}),
    generated({head:{ref:"fix/235",repo:{full_name:"ePlus-DEV/muse-invite-hub"}}}),
    generated({head:{ref:"auto/issue-235-invite",repo:{full_name:"someone-else/repo"}}}),
    generated({head:{ref:"auto/issue-236-invite",repo:{full_name:"ePlus-DEV/muse-invite-hub"}}}),
    generated({title:"data: review ABC123 invite (issue #236)"}),
    generated({body:"See Issue #235, but this PR does not track it."}),
    generated({state:"closed"}),
    generated({merged_at:"2026-11-17T00:00:00Z"}),
    generated({head:{ref:"auto/issue-235-invite-extra",repo:{full_name:"ePlus-DEV/muse-invite-hub"}}})
  ])assert.equal(automatedSourceIssueNumber(pr),null);
});

test("only deleted Issues trigger closure; 404 requires a signed matching deletion event", () => {
  assert.equal(deletedSourceConfirmed(410,235),true);
  assert.equal(deletedSourceConfirmed(410,235,235),true);
  assert.equal(deletedSourceConfirmed(404,235),false);
  assert.equal(deletedSourceConfirmed(404,235,236),false);
  assert.equal(deletedSourceConfirmed(404,235,235),true);
  assert.equal(deletedSourceConfirmed(403,235,235),false);
  assert.equal(deletedSourceConfirmed(200,235,235),false);
  assert.equal(deletedSourceConfirmed(410,0,0),false);
  assert.match(deletionNotice(235),/source Issue #235 was deleted/);
  assert.throws(()=>deletionNotice(-1),/positive integer/);
});

test("trusted workflow responds to deletion immediately and reconciles missed events", () => {
  const workflow=readFileSync(new URL("../.github/workflows/close-deleted-issue-prs.yml",import.meta.url),"utf8");
  assert.match(workflow,/issues:\s*\n\s*types: \[deleted\]/);
  assert.match(workflow,/schedule:/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/ref: main/);
  assert.match(workflow,/github\.rest\.issues\.get/);
  assert.match(workflow,/github\.rest\.pulls\.update/);
  assert.match(workflow,/automatedSourceIssueNumber/);
  assert.doesNotMatch(workflow,/deleteRef|git\.deleteRef|git push|pull_request_target:/);
});
