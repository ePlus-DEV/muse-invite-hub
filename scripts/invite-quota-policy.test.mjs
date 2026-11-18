import test from "node:test";
import assert from "node:assert/strict";
import {MAX_INVITES_PER_CODE,validReportedQuota} from "./invite-quota-policy.mjs";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";

test("one shared quota policy has an inclusive maximum of 30, never a default",()=>{
  assert.equal(MAX_INVITES_PER_CODE,30);
  assert.equal(validReportedQuota({reportedCapacity:30,reportedUses:0}),true);
  assert.equal(validReportedQuota({reportedCapacity:30,reportedUses:30}),true);
  assert.equal(validReportedQuota({reportedCapacity:20,reportedUses:3}),true);
  assert.equal(validReportedQuota({reportedRemaining:0}),true);
  assert.equal(validReportedQuota({reportedRemaining:30}),true);
  assert.equal(validReportedQuota({}),false);
  for(const count of [31,99,1000]){
    assert.equal(validReportedQuota({reportedCapacity:count,reportedUses:0}),false);
    assert.equal(validReportedQuota({reportedRemaining:count}),false);
    assert.equal(validReportedQuota({reportedCapacity:30,reportedUses:count}),false);
  }
  for(const value of [-1,1.1,"30",null]){
    assert.equal(validReportedQuota({reportedRemaining:value}),false);
  }
  assert.equal(validReportedQuota({reportedRemaining:20,reportedCapacity:30,reportedUses:10}),false);
});

test("web, Telegram and trusted parsers use the same explicit cap",()=>{
  // Static frontends cannot import Node-only build helpers; this test catches
  // drift between their local browser/Worker bounds and trusted validation.
  const folder=dirname(fileURLToPath(import.meta.url));
  for(const path of [
    "issue-to-pr.mjs","validate.mjs","feedback-comment-to-pr.mjs",
    "close-published-comment-counts.mjs","site-pages.mjs"
  ]){
    const text=readFileSync(resolve(folder,path),"utf8");
    assert.match(text,/MAX_INVITES_PER_CODE/);
  }
  for(const path of ["../assets/directory-features.js","../assets/app.js",
    "../telegram/github.mjs"]){
    const text=readFileSync(resolve(folder,path),"utf8");
    assert.match(text,/MAX_INVITES_PER_CODE\s*=\s*30\s*;/);
  }
});
