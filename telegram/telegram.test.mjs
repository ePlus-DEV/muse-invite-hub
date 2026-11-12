import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseUpdate } from "./bot.mjs";
import { createTelegramApp } from "./server.mjs";

const token="123456789012345678901234567890";
const secret="0123456789abcdef0123456789abcdef";
const read=(name)=>readFileSync(new URL(name,import.meta.url),"utf8");

test("Telegram commands accept only public code patterns and known report outcomes",()=>{
  assert.deepEqual(parseCommand("/submit dpnihh"),{type:"confirm-submit",code:"DPNIHH"});
  assert.deepEqual(parseCommand("/report dpnihh worked"),
    {type:"confirm-report",code:"DPNIHH",result:"worked"});
  assert.equal(parseCommand("/report DPNIHH maybe").type,"usage-report");
  assert.equal(parseCommand("/submit ../secret").type,"usage-submit");
  assert.equal(parseCommand("/count").type,"count");
  assert.equal(parseCommand("/codes").type,"codes");
  assert.equal(parseCommand("/start@MuseBot").type,"help");
  assert.equal(parseCommand("x".repeat(400)).type,"help");
  assert.equal(parseUpdate({update_id:1,message:{chat:{id:123,type:"group"},from:{is_bot:false},
    text:"/submit CODE11"}}).type,"private-only");
  assert.equal(parseUpdate({update_id:2,message:{chat:{id:123,type:"private"},from:{is_bot:true},
    text:"/submit CODE11"}}),null);
  assert.equal(parseUpdate({update_id:3,callback_query:{
    id:"callback",from:{id:42},message:{chat:{id:43,type:"private"}},data:"t:submit:CODE11"
  }}),null,"A callback from another account cannot submit as the private-chat owner");
  assert.equal(parseUpdate({update_id:4,callback_query:{
    id:"callback",from:{id:42},message:{chat:{id:42,type:"private"}},data:"t:submit:CODE11"
  }}).type,"submit");
});

async function withApp(run,services={}) {
  const dir=mkdtempSync(join(tmpdir(),"muse-telegram-test-"));
  const sent=[],calls={submit:[],report:[]};
  const defaults={
    listRecentCodes:async()=>["DPNIHH","TEST42"],
    submitNewCode:async(...args)=>{calls.submit.push(args);return {kind:"submitted",url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/90"};},
    submitFeedback:async(...args)=>{calls.report.push(args);return {kind:"reported",url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/14"};}
  };
  const options={
    token,secret,githubToken:"issue-token-test",dataDir:dir,
    services:{...defaults,...services},
    telegramApi:async (name,payload)=>sent.push({name,payload})
  };
  const server=createTelegramApp(options);
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const origin="http://127.0.0.1:"+server.address().port;
  const post=(update,override={})=>fetch(origin+"/telegram/webhook",{
    method:"POST",
    headers:{"Content-Type":"application/json",
      "X-Telegram-Bot-Api-Secret-Token":secret,...override},
    body:JSON.stringify(update)
  });
  try{return await run({dir,origin,server,post,sent,calls,options});}
  finally{
    await new Promise(resolve=>server.close(resolve));
    rmSync(dir,{recursive:true,force:true});
  }
}
const message=(id,text)=>({update_id:id,message:{text,from:{id:42,is_bot:false},
  chat:{id:42,type:"private"}}});
const callback=(id,data)=>({update_id:id,callback_query:{id:"cb-"+id,data,
  from:{id:42},message:{chat:{id:42,type:"private"}}}});

test("webhook checks method, path, JSON and constant-time shared secret",async()=>{
  await withApp(async({origin,post})=>{
    assert.equal((await fetch(origin+"/healthz")).status,200);
    assert.equal((await fetch(origin+"/telegram/webhook")).status,404);
    assert.equal((await post(message(1,"/start"),
      {"X-Telegram-Bot-Api-Secret-Token":"totally-wrong-secret"})).status,403);
    assert.equal((await post(message(1,"/start"),{"Content-Type":"text/plain"})).status,415);
    assert.equal((await post({update_id:"bad"})).status,400);
    assert.equal((await post(message(1,"/start"))).status,200);
  });
});
test("submit and report are explicitly confirmed, then sent to GitHub once",async()=>{
  await withApp(async({post,sent,calls,dir,options})=>{
    assert.equal((await post(message(10,"/submit TEST42"))).status,200);
    assert.equal(calls.submit.length,0,"Typing a code must not create a public Issue without consent");
    assert.match(sent.at(-1).payload.text,/PUBLIC GitHub Issue/);
    assert.equal((await post(callback(11,"t:submit:TEST42"))).status,200);
    assert.equal(calls.submit.length,1);
    assert.deepEqual(calls.submit[0],["TEST42",11,"issue-token-test"]);
    assert.equal((await post(callback(11,"t:submit:TEST42"))).status,200);
    assert.equal(calls.submit.length,1,"Repeated Telegram delivery is idempotent");
    assert.equal((await post(message(12,"/report DPNIHH worked"))).status,200);
    assert.equal(calls.report.length,0);
    assert.equal((await post(callback(13,"t:report:DPNIHH:worked"))).status,200);
    assert.equal(calls.report.length,1);
    assert.deepEqual(calls.report[0],["DPNIHH","worked",13,"issue-token-test"]);
    const ids=JSON.parse(readFileSync(join(dir,"processed-updates.json"),"utf8"));
    assert.deepEqual(ids,[10,11,12,13]);
    // A service restart must not repost a previously processed Telegram update.
    const restarted=createTelegramApp(options);
    await new Promise(resolve=>restarted.listen(0,"127.0.0.1",resolve));
    const again=await fetch("http://127.0.0.1:"+restarted.address().port+"/telegram/webhook",{
      method:"POST",headers:{"Content-Type":"application/json",
        "X-Telegram-Bot-Api-Secret-Token":secret},
      body:JSON.stringify(callback(13,"t:report:DPNIHH:worked"))
    });
    assert.equal(again.status,200);
    assert.equal(calls.report.length,1);
    await new Promise(resolve=>restarted.close(resolve));
  });
});
test("processing failures return 503 so Telegram can retry, without recording success",async()=>{
  let fail=true,attempts=0;
  await withApp(async({post,sent})=>{
    const update=callback(90,"t:submit:CODE12");
    assert.equal((await post(update)).status,503);
    assert.equal((await post(update)).status,200);
    assert.equal(attempts,2);
    assert.match(sent.at(-1).payload.text,/Submitted a public GitHub Issue/);
  },{
    submitNewCode:async()=>{
      attempts++;
      if(fail){fail=false;throw Error("Temporary upstream outage");}
      return {kind:"submitted",url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/90"};
    }
  });
});
test("deployment sources never embed real credentials or auto-publish third-party identity",()=>{
  const github=read("github.mjs");
  const server=read("server.mjs");
  const compose=read("compose.yaml");
  const workflow=read("../.github/workflows/telegram-oci-image.yml");
  assert.match(github,/\[Telegram submission\]/);
  assert.doesNotMatch(github,/title:"\[Invite\]/);
  assert.match(github,/maintainer review only/);
  assert.match(server,/timingSafeEqual/);
  assert.match(server,/MAX_BODY=32\*1024/);
  assert.match(compose,/read_only: true/);
  assert.match(compose,/security_opt:/);
  assert.doesNotMatch(compose,/3000:3000/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/platforms: linux\/arm64/);
  assert.doesNotMatch(workflow,/push:\s*\n\s*branches:/);
});
