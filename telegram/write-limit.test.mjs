import test from "node:test";
import assert from "node:assert/strict";
import {recentWriteEvents,writeDecision,WRITE_HOUR_MS,WRITE_DAY_MS,WRITE_LIMITS} from "./write-limit.mjs";

const NOW=Date.parse("2026-11-17T10:00:00Z");
const put=(history,kind,id,now=NOW,scope="chat")=>
  writeDecision(history,{kind,updateId:id,scope,now});

test("legacy KV timestamp arrays retain quota rather than resetting it",()=>{
  const legacy=Array.from({length:8},(_,i)=>NOW-i*1000);
  assert.equal(recentWriteEvents(legacy,NOW).length,8);
  assert.equal(put(legacy,"submit",9).allowed,false);
  assert.throws(()=>recentWriteEvents([{}],NOW),/Invalid private/);
  assert.throws(()=>recentWriteEvents("wrong",NOW),/Invalid private/);
});

test("three new codes per chat per day, including different codes and callbacks",()=>{
  let records=[];
  for(let i=0;i<WRITE_LIMITS.newCodesDaily;i++){
    const decision=put(records,"submit",i);
    assert.equal(decision.allowed,true);
    records=decision.history;
  }
  assert.equal(put(records,"submit",99).allowed,false);
  // Reporting a known code remains possible under the separate total budget.
  assert.equal(put(records,"report",100).allowed,true);
  // Retry of one update never exhausts additional slots.
  assert.deepEqual(put(records,"submit",1),{allowed:true,retry:true,history:records});
});

test("hourly and daily budgets are independent and roll off with time",()=>{
  let history=[];
  for(let i=0;i<WRITE_LIMITS.chatHourly;i++){
    const d=put(history,"report",i,NOW);
    assert.equal(d.allowed,true);
    history=d.history;
  }
  assert.equal(put(history,"report",9,NOW).allowed,false);
  for(let i=8;i<WRITE_LIMITS.chatDaily;i++){
    const d=put(history,"report",i,NOW+WRITE_HOUR_MS+1000);
    assert.equal(d.allowed,true);
    history=d.history;
  }
  assert.equal(put(history,"report",999,NOW+WRITE_HOUR_MS+1000).allowed,false);
  assert.equal(put(history,"report",999,NOW+WRITE_DAY_MS+WRITE_HOUR_MS+2000).allowed,true);
});

test("global new-code budgets bound many different chat accounts (best effort)",()=>{
  let history=[];
  for(let i=0;i<WRITE_LIMITS.globalNewHourly;i++){
    const d=put(history,"submit",i,NOW,"global");
    assert.equal(d.allowed,true);
    history=d.history;
  }
  assert.equal(put(history,"submit",100,NOW,"global").allowed,false);
  assert.equal(put(history,"submit",100,NOW+WRITE_HOUR_MS+1,"global").allowed,true);
});

test("private abuse state rejects invalid IDs, future timestamps and malformed input",()=>{
  assert.throws(()=>put([],"code",1),/Invalid write-rate request/);
  assert.throws(()=>put([],"submit",-1),/Invalid write-rate request/);
  assert.deepEqual(recentWriteEvents([{at:NOW+1000,kind:"submit",updateId:1}],NOW),[]);
});
