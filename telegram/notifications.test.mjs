import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hmacSignature,parseSignedEvent,publishNotifications,notificationResponse } from "./notifications.mjs";
import { makeNodeNotifyState } from "./notify-oci.mjs";
import { makeWorkerNotifyState } from "./notify-worker.mjs";

const secret="0123456789abcdef0123456789abcdef0123456789abcdef";
const sha="a".repeat(40);
async function request({body={event:"pages-published",sha,cursor:null},ts=Date.now(),bad=false}={}) {
  const raw=JSON.stringify(body);
  const signature=await hmacSignature(secret,ts,raw);
  return new Request("https://bot.example.com/telegram/notify",{
    method:"POST",headers:{
      "Content-Type":"application/json",
      "x-muse-notify-timestamp":String(ts),
      "x-muse-notify-signature":"sha256="+(bad?"0".repeat(64):signature)
    },body:raw
  });
}
function fakeState(profiles=[]) {
  let baseline=null;
  const sent=new Set();
  return {
    async getBaseline(){return baseline;},
    async setBaseline(codes){baseline=[...codes];},
    async listProfiles(cursor,limit) {
      const index=Number(cursor||0);
      return {profiles:profiles.slice(index,index+limit),
        cursor:index+limit<profiles.length?String(index+limit):null};
    },
    async wasSent(id,code){return sent.has(id+":"+code);},
    async markSent(id,code){sent.add(id+":"+code);}
  };
}
const event={sha};
const catalog=()=>[];
const user=(chatId,values={})=>({
  chatId,profile:{subscribed:false,watching:[],submitted:[],...values}
});

test("HMAC auth rejects tampering, stale events and missing signature",async()=>{
  const valid=await request();
  assert.deepEqual(await parseSignedEvent(valid,secret),{sha,cursor:undefined});
  assert.equal(await parseSignedEvent(await request({bad:true}),secret),null);
  assert.equal(await parseSignedEvent(await request({ts:Date.now()-3600000}),secret),null);
  assert.equal(await parseSignedEvent(await request({
    body:{event:"pages-published",sha:"BAD",cursor:null}
  }),secret),null);
  const invalid=new Request("https://bot.example.com/telegram/notify",{method:"POST",body:"{}"});
  assert.equal(await parseSignedEvent(invalid,secret),null);
});

test("first publication only initializes baseline, then opts in safely",async()=>{
  const state=fakeState([
    user(42,{subscribed:true}),
    user(43,{watching:["BBB222"]}),
    user(44,{submitted:[{code:"BBB222",url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/90"}]}),
    user(45)
  ]);
  let items=[{code:"AAA111"}];
  const sent=[];
  const args={event,state,catalog:async()=>items,send:async(id,message)=>sent.push({id,message})};
  assert.deepEqual(await publishNotifications(args),{initialized:true,sent:0,complete:true});
  assert.equal(sent.length,0,"must not blast historic codes");
  items=[{code:"AAA111"},{code:"BBB222"}];
  assert.deepEqual(await publishNotifications(args),{sent:3,complete:true});
  assert.deepEqual(sent.map(x=>x.id),[42,43,44]);
  assert.match(sent.find(x=>x.id===44).message,/Your Telegram contribution is now published/);
  assert.match(sent[0].message,/NOT Muse-verified/);
  assert.deepEqual(await publishNotifications(args),{sent:0,complete:true});
  assert.equal(sent.length,3,"no duplicate notification on repeated deployment");
});

test("pagination and retries preserve per-chat/code delivery markers",async()=>{
  const users=Array.from({length:13},(_,i)=>user(i+1,{subscribed:true}));
  const state=fakeState(users);
  let items=[{code:"AAA111"}];
  const delivered=[];
  const args={event,state,catalog:async()=>items,send:async(id,txt)=>delivered.push(id)};
  await publishNotifications(args);
  items.push({code:"BBB222"});
  const first=await publishNotifications(args);
  assert.equal(first.sent,10);
  assert.equal(first.complete,false);
  assert.equal(first.nextCursor,"10");
  const last=await publishNotifications({...args,event:{sha,cursor:first.nextCursor}});
  assert.deepEqual(last,{sent:3,complete:true});
  assert.equal(delivered.length,13);
  assert.deepEqual(await publishNotifications(args),{sent:0,complete:true});
});

test("transient Telegram failure does not advance baseline",async()=>{
  const state=fakeState([user(42,{subscribed:true})]);
  let items=[{code:"AAA111"}];
  await publishNotifications({event,state,catalog:async()=>items,send:async()=>{}});
  items.push({code:"BBB222"});
  await assert.rejects(()=>publishNotifications({
    event,state,catalog:async()=>items,
    send:async()=>{throw Error("temporary");},
    logger:()=>{}
  }),/temporary/);
  const delivered=[];
  assert.equal((await publishNotifications({
    event,state,catalog:async()=>items,
    send:async id=>delivered.push(id)
  })).sent,1);
  assert.deepEqual(delivered,[42]);
});

test("HTTP endpoint protects secrets and responds with resumable JSON",async()=>{
  const state=fakeState();
  const deps={secret,state,catalog:async()=>[{code:"AAA111"}],send:async()=>{}};
  assert.equal((await notificationResponse(await request({bad:true}),deps)).status,403);
  const result=await notificationResponse(await request(),deps);
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{initialized:true,sent:0,complete:true});
});

test("OCI notification state survives process restart without exposing private data",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"muse-notify-"));
  try{
    writeFileSync(join(dir,"private-profiles.json"),JSON.stringify({
      "42":{subscribed:true,watching:[],submitted:[],pending:null}
    }));
    const first=makeNodeNotifyState(dir);
    assert.equal(await first.getBaseline(),null);
    await first.setBaseline(["AAA111"]);
    assert.deepEqual((await first.listProfiles(null,10)).profiles[0].chatId,42);
    await first.markSent(42,"BBB222");
    const second=makeNodeNotifyState(dir);
    assert.deepEqual(await second.getBaseline(),["AAA111"]);
    assert.equal(await second.wasSent(42,"BBB222"),true);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test("Workers KV keeps subscriber records private and supports cursor paging",async()=>{
  const map=new Map();
  map.set("profile:42",JSON.stringify({subscribed:true}));
  map.set("profile:43",JSON.stringify({subscribed:false}));
  const kv={
    async get(key){return map.has(key)?map.get(key):null;},
    async put(key,value){map.set(key,value);},
    async list({prefix,limit,cursor}){
      const keys=[...map.keys()].filter(x=>x.startsWith(prefix)).sort();
      const offset=Number(cursor||0),selected=keys.slice(offset,offset+limit);
      return {keys:selected.map(name=>({name})),
        list_complete:offset+limit>=keys.length,cursor:String(offset+limit)};
    }
  };
  const state=makeWorkerNotifyState(kv);
  assert.equal(await state.getBaseline(),null);
  await state.setBaseline(["AAA111"]);
  assert.deepEqual(await state.getBaseline(),["AAA111"]);
  const page=await state.listProfiles(undefined,1);
  assert.equal(page.profiles[0].chatId,42);
  assert.equal(page.cursor,"1");
  assert.equal((await state.listProfiles(page.cursor,1)).profiles[0].chatId,43);
  assert.equal(await state.wasSent(42,"BBB222"),false);
  await state.markSent(42,"BBB222");
  assert.equal(await state.wasSent(42,"BBB222"),true);
});
