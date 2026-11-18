import test from "node:test";
import assert from "node:assert/strict";
import {MAX_INVITES_PER_CODE,validReportedQuota,displayQuota,withDisplayQuota} from "./invite-quota-policy.mjs";
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
    "close-published-comment-counts.mjs"
  ]){
    const text=readFileSync(resolve(folder,path),"utf8");
    assert.match(text,/MAX_INVITES_PER_CODE/);
  }
  assert.match(readFileSync(resolve(folder,"site-pages.mjs"),"utf8"),/displayQuota/);
  for(const path of ["../assets/directory-features.js","../assets/app.js",
    "../telegram/github.mjs"]){
    const text=readFileSync(resolve(folder,path),"utf8");
    assert.match(text,/MAX_INVITES_PER_CODE\s*=\s*30\s*;/);
  }
});

test("catalog output explicitly labels initial 30/30 without forging usage history",()=>{
  const records=[
    {id:"new",code:"NEW123",addedAt:"2026-11-18",status:"unverified"},
    {id:"owner",code:"OWN123",reportedCapacity:30,reportedUses:11,usageReportedAt:"2026-11-18"},
    {id:"smaller",code:"SMALL1",reportedCapacity:20,reportedUses:3,usageReportedAt:"2026-11-17"},
    {id:"partial",code:"ONLY19",reportedRemaining:19,usageReportedAt:"2026-11-16"}
  ];
  const data=withDisplayQuota(records);
  assert.deepEqual(data[0].quotaDisplay,
    {capacity:30,remaining:30,used:0,basis:"default",reportedAt:null});
  assert.deepEqual(data[1].quotaDisplay,
    {capacity:30,remaining:19,used:11,basis:"reported",reportedAt:"2026-11-18"});
  assert.deepEqual(data[2].quotaDisplay,
    {capacity:20,remaining:17,used:3,basis:"reported",reportedAt:"2026-11-17"});
  assert.deepEqual(data[3].quotaDisplay,
    {capacity:30,remaining:19,used:11,basis:"reported-remaining",reportedAt:"2026-11-16"});
  assert.equal(records[0].quotaDisplay,undefined,"Source catalog remains untouched");
  assert.equal(data[0].reportedUses,undefined,"Never create usage from a default");
  assert.equal(data[0].usageReportedAt,undefined,"No fabricated report date");
  assert.equal(data[0].quotaUpdateCount,undefined,"No fabricated revision count");
  assert.deepEqual(displayQuota({reportedCapacity:31,reportedUses:0,usageReportedAt:"2026-11-18"}),
    {capacity:30,remaining:null,used:null,basis:"invalid",reportedAt:null});
});
