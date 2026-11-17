import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, parseUpdate, BOT_COMMANDS, formatCodeStatus } from "./bot.mjs";
import { getCodeStatus, submitNewCode } from "./github.mjs";
import { createTelegramApp } from "./server.mjs";

const token="123456789012345678901234567890";
const secret="0123456789abcdef0123456789abcdef";
const read=(name)=>readFileSync(new URL(name,import.meta.url),"utf8");

test("Telegram commands accept only public code patterns and known report outcomes",()=>{
  assert.deepEqual(parseCommand("/submit dpnihh"),{type:"confirm-submit",code:"DPNIHH"});
  assert.deepEqual(parseCommand("/report dpnihh worked"),
    {type:"confirm-report",code:"DPNIHH",result:"worked"});
  assert.equal(parseCommand("/report DPNIHH maybe").type,"usage-report");
  for(const invalid of ["ABCDE","ABCDEFG","ABC-12","ABC_12"]){
    assert.equal(parseCommand("/submit "+invalid).type,"usage-submit");
    assert.equal(parseCommand("/report "+invalid+" worked").type,"usage-report");
    assert.equal(parseUpdate({update_id:999,callback_query:{id:"cb",from:{id:42},
      message:{chat:{id:42,type:"private"}},data:"t:submit:"+invalid}}).type,"cancel");
  }
  assert.equal(parseCommand("/submit ../secret").type,"usage-submit");
  assert.equal(parseCommand("/count").type,"count");
  assert.equal(parseCommand("/codes").type,"browse");
  assert.equal(parseCommand("/refresh").type,"refresh");
  assert.deepEqual(parseCommand("/status dpnihh"),{type:"status",code:"DPNIHH"});
  assert.deepEqual(parseCommand("/code dpnihh"),{type:"status",code:"DPNIHH"});
  assert.equal(parseCommand("/status DPNIH").type,"usage-status");
  assert.equal(parseCommand("/status DPNIHH EXTRA").type,"usage-status");
  assert.equal(parseCommand("/privacy").type,"privacy");
  assert.equal(parseCommand("/cancel").type,"cancel");
  assert.equal(BOT_COMMANDS.length,23);
  assert.equal(new Set(BOT_COMMANDS.map(x=>x.command)).size,BOT_COMMANDS.length);
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
    getCodeStatus:async code=>({kind:"listed",status:"unverified",reportedRemaining:23,
      usageReportedAt:"2026-11-15",url:"https://muse.eplus.dev/codes/"+code+"/"}),
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
const message=(id,text)=>({update_id:id,message:{text,from:{id:42,is_bot:false,username:"alice_dev"},
  chat:{id:42,type:"private"}}});
const callback=(id,data)=>({update_id:id,callback_query:{id:"cb-"+id,data,
  from:{id:42,username:"alice_dev"},message:{message_id:id+100,chat:{id:42,type:"private"}}}});

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
    assert.deepEqual(calls.submit[0],["TEST42",11,"issue-token-test","alice_dev"]);
    assert.equal(sent.at(-1).name,"editMessageReplyMarkup");
    assert.deepEqual(sent.at(-1).payload.reply_markup,{inline_keyboard:[]});
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
test("code status and privacy are informational in the Node webhook",async()=>{
  await withApp(async({post,sent,calls})=>{
    assert.equal((await post(message(30,"/status DPNIHH"))).status,200);
    assert.match(sent.at(-1).payload.text,/23 \(as of 2026-11-15; not live\)/);
    assert.match(sent.at(-1).payload.text,/Unverified/);
    assert.equal((await post(message(31,"/status ABCDE"))).status,200);
    assert.match(sent.at(-1).payload.text,/exactly 6/);
    assert.equal((await post(message(32,"/privacy"))).status,200);
    assert.match(sent.at(-1).payload.text,/PUBLIC GitHub Issue/);
    assert.equal(calls.submit.length,0);
    assert.equal(calls.report.length,0);
  });
});

test("GitHub code status distinguishes published, pending, closed and unknown",async()=>{
  const original=globalThis.fetch;
  const entries=[{code:"DPNIHH",status:"unverified",reportedCapacity:30,
    reportedUses:7,usageReportedAt:"2026-11-15"}];
  try {
    globalThis.fetch=async url=>{
      const u=String(url);
      const value=u.includes("/data/invites.json")?entries:
        u.includes("/issues?")?[
          {title:"[Telegram submission] TEST42",
            body:"<!-- muse-telegram-submission:TEST42 -->",state:"open",html_url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/42"},
          {title:"[Telegram submission] CLOSED",
            body:"<!-- muse-telegram-submission:CLOSED -->",state:"closed",html_url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/43"}
        ]:[];
      return new Response(JSON.stringify(value),{status:200});
    };
    const listed=await getCodeStatus("DPNIHH","test-token");
    assert.equal(listed.kind,"listed");
    assert.equal(listed.reportedRemaining,23);
    assert.match(formatCodeStatus("DPNIHH",listed),/not live/);
    const pending=await getCodeStatus("TEST42","test-token");
    assert.equal(pending.kind,"pending");
    assert.match(formatCodeStatus("TEST42",pending),/not published yet/);
    assert.equal((await getCodeStatus("CLOSED","test-token")).kind,"closed");
    assert.equal((await getCodeStatus("UNSEEN","test-token")).kind,"unknown");
  } finally {globalThis.fetch=original;}
});

test("Telegram contributions keep closed Issues distinct and require human source review",async()=>{
  const original=globalThis.fetch;
  let includeClosed=true;
  const writes=[];
  try {
    globalThis.fetch=async (url,options={})=>{
      const request=String(url);
      if(request.includes("/data/invites.json"))return new Response("[]",{status:200});
      if(request.includes("/issues?"))return new Response(JSON.stringify(includeClosed?[{
        title:"[Telegram submission] CLOSED",
        body:"<!-- muse-telegram-submission:CLOSED -->",
        state:"closed",html_url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/43"
      }]:[]),{status:200});
      if(request.endsWith("/issues")&&options.method==="POST"){
        writes.push(JSON.parse(options.body));
        return new Response(JSON.stringify({html_url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/229"}),{status:201});
      }
      throw Error("Unexpected request: "+request);
    };
    const closed=await submitNewCode("CLOSED",80,"test-token","alice_dev");
    assert.equal(closed.kind,"closed");
    assert.equal(closed.url,"https://github.com/ePlus-DEV/muse-invite-hub/issues/43");
    assert.equal(writes.length,0,"Closed duplicate must not create a new Issue");
    includeClosed=false;
    const fresh=await submitNewCode("NEW123",81,"test-token","alice_dev");
    assert.equal(fresh.kind,"submitted");
    assert.equal(writes.length,1);
    assert.equal(writes[0].title,"[Telegram submission] NEW123");
    assert.match(writes[0].body,/### Invite code\n\nNEW123/);
    assert.match(writes[0].body,/### Code source\n\nTelegram \(community code shared through bot\)/);
    assert.match(writes[0].body,/### Contributor checklist\n\n- \[x\]/);
    assert.match(writes[0].body,/### Telegram contributor\n\n@alice_dev/);
    assert.match(writes[0].body,/https:\/\/t\.me\/alice_dev/);
    assert.match(writes[0].body,/Maintainer review checklist/);
    assert.match(writes[0].body,/review-only Draft PR/);
    assert.doesNotMatch(writes[0].body,/Telegram chat ID|Telegram user ID|id:42|chat_id/);
  } finally {globalThis.fetch=original;}
});

test("New Telegram contributions require a real username and explicit public attribution consent",async()=>{
  await withApp(async({post,sent,calls})=>{
    const unassigned=message(800,"/submit NEW123");
    delete unassigned.message.from.username;
    assert.equal((await post(unassigned)).status,200);
    assert.match(sent.at(-1).payload.text,/set a public Telegram @username/);
    assert.equal(calls.submit.length,0);
    const callbackWithout=callback(801,"t:submit:NEW123");
    delete callbackWithout.callback_query.from.username;
    assert.equal((await post(callbackWithout)).status,200);
    assert.match(sent.findLast(x=>x.name==="sendMessage").payload.text,/set a public Telegram @username/);
    assert.equal(calls.submit.length,0);
    assert.equal((await post(message(802,"/submit NEW123"))).status,200);
    assert.match(sent.at(-1).payload.text,/@alice_dev/);
    assert.match(sent.at(-1).payload.text,/PUBLIC GitHub Issue/);
    assert.equal(calls.submit.length,0);
    assert.equal((await post(callback(803,"t:submit:NEW123"))).status,200);
    assert.deepEqual(calls.submit[0],["NEW123",803,"issue-token-test","alice_dev"]);
  });
});

test("processing failures return 503 so Telegram can retry, without recording success",async()=>{
  let fail=true,attempts=0;
  await withApp(async({post,sent})=>{
    const update=callback(90,"t:submit:CODE12");
    assert.equal((await post(update)).status,503);
    assert.equal((await post(update)).status,200);
    assert.equal(attempts,2);
    assert.match(sent.findLast(x=>x.name==="sendMessage").payload.text,/Submitted a public GitHub Issue/);
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

test("OCI Refresh re-fetches published codes without posting or changing preferences",async()=>{
  let reads=0;
  await withApp(async({post,sent,calls})=>{
    assert.equal((await post(message(500,"/start"))).status,200);
    assert.equal(sent.at(-1).payload.reply_markup.keyboard[3][0],"🔄 Refresh");
    assert.equal((await post(callback(501,"t:role:seeker"))).status,200);
    assert.equal(sent.at(-1).payload.reply_markup.keyboard[3][0],"🔄 Refresh");
    assert.equal((await post(message(502,"🔄 Refresh"))).status,200);
    assert.equal(reads,1);
    assert.match(sent.at(-1).payload.reply_markup.inline_keyboard[0][0].text,/1 /);
    assert.equal((await post(message(503,"/refresh"))).status,200);
    assert.equal(reads,2);
    assert.match(sent.at(-1).payload.reply_markup.inline_keyboard[0][0].text,/2 /);
    assert.equal((await post(callback(504,"t:refresh-code:DPNIHH"))).status,200);
    assert.equal(reads,3);
    assert.equal(sent.at(-1).name,"editMessageText");
    assert.match(sent.at(-1).payload.text,/Reported 3 remaining/);
    assert.equal(calls.submit.length,0);
    assert.equal(calls.report.length,0);
  },{browseCodes:async()=>{
    reads++;
    return [{code:"DPNIHH",status:"unverified",remaining:reads,usageReportedAt:"2026-11-15"}];
  }});
});

test("OCI bot navigates pages, detail and Back without public writes",async()=>{
  const items=Array.from({length:8},(_,i)=>({
    code:"PAGE"+String(i).padStart(2,"0"),status:"unverified",
    remaining:i,usageReportedAt:"2026-11-15",addedAt:"2026-11-14",platform:"Threads"
  }));
  await withApp(async({post,sent,calls})=>{
    assert.equal((await post(message(510,"/codes"))).status,200);
    assert.equal(sent.filter(x=>x.name==="sendMessage").length,1);
    assert.equal(sent.at(-1).payload.reply_markup.inline_keyboard[0][0].callback_data,"t:detail:PAGE00");
    assert.equal((await post(callback(511,"t:page:1"))).status,200);
    assert.equal(sent.at(-1).name,"editMessageText",
      "Pagination must edit the existing bot message rather than send duplicates");
    assert.match(sent.at(-1).payload.text,/Page 2/);
    assert.equal((await post(callback(512,"t:detail:PAGE05"))).status,200);
    assert.match(sent.at(-1).payload.text,/Platform: Threads/);
    assert.equal((await post(callback(513,"t:back-list"))).status,200);
    assert.match(sent.at(-1).payload.text,/Page 2/);
    assert.equal((await post(callback(514,"t:home"))).status,200);
    assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 I need a code");
    assert.equal(calls.submit.length,0);
    assert.equal(calls.report.length,0);
  },{browseCodes:async({offset=0,limit=6,query=""})=>
    items.filter(x=>!query||x.code.includes(query)).slice(offset,offset+limit)});
});

test("OCI bot defaults to English and retains an explicit Japanese override",async()=>{
  await withApp(async({post,sent,dir})=>{
    const vi={...message(600,"/start")};
    vi.message.from.language_code="vi-VN";
    assert.equal((await post(vi)).status,200);
    assert.match(sent.at(-1).payload.text,/Welcome/);
    assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 I need a code");
    assert.equal((await post(message(601,"/status DPNIHH"))).status,200);
    assert.match(sent.at(-1).payload.text,/published/);
    assert.equal((await post(message(602,"/language ja"))).status,200);
    assert.match(sent.at(-1).payload.text,/日本語/);
    assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 コードが欲しい");
    assert.equal((await post(message(603,"/privacy"))).status,200);
    assert.match(sent.at(-1).payload.text,/Telegramの身元/);
    const vietnameseTelegram={...message(604,"/start")};
    vietnameseTelegram.message.from.language_code="vi";
    assert.equal((await post(vietnameseTelegram)).status,200);
    assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 コードが欲しい",
      "manual Japanese setting must override Telegram Vietnamese language_code");
    const stored=JSON.parse(readFileSync(join(dir,"private-profiles.json"),"utf8"));
    assert.equal(stored["42"].language,"ja");
    assert.equal(stored["42"].languageManual,true);
    assert.equal((await post(message(605,"/language"))).status,200);
    assert.equal(sent.at(-1).payload.reply_markup.inline_keyboard.length,3);
    assert.equal((await post(callback(606,"t:lang:en"))).status,200);
    assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 I need a code");
  });
});

test("OCI onboarding differentiates invite seekers and contributors without publishing or auto-subscribing",async()=>{
  await withApp(async({post,sent,calls,dir})=>{
    assert.equal((await post(message(699,"/language vi"))).status,200);
    const vi={...message(700,"/start")};
    vi.message.from.language_code="vi-VN";
    assert.equal((await post(vi)).status,200);
    assert.match(sent.at(-1).payload.text,/Bạn đến đây để làm gì/);
    const welcome=sent.at(-1).payload.reply_markup.keyboard;
    assert.deepEqual(welcome.map(x=>x.length),[1,1,1,1]);
    assert.equal(welcome[3][0],"🔄 Làm mới");
    assert.equal(welcome[0][0],"🙋 Tôi cần mã");
    assert.equal(welcome[1][0],"🤝 Tôi muốn chia sẻ mã");

    assert.equal((await post(callback(701,"t:role:seeker"))).status,200);
    const seeker=sent.at(-1).payload.reply_markup.keyboard.flat();
    assert.equal(seeker.length,10);
    assert.ok(seeker.includes("🔄 Làm mới"));
    assert.ok(seeker.includes("🎟 Nhận mã"));
    assert.ok(seeker.includes("🙋 Cần mã"));
    assert.ok(seeker.includes("🔄 Đổi vai trò"));

    assert.equal((await post(message(702,"🙋 Cần mã"))).status,200);
    const offer=sent.at(-1).payload;
    assert.match(offer.text,/không đảm bảo mã còn lượt sử dụng/i);
    assert.equal(offer.reply_markup.inline_keyboard.length,4);
    assert.equal(offer.reply_markup.inline_keyboard[3][0].callback_data,"t:home");
    const profilePath=join(dir,"private-profiles.json");
    const profile=()=>JSON.parse(readFileSync(profilePath,"utf8"))["42"];
    assert.equal(profile().role,"seeker");
    assert.equal(profile().subscribed,false,"needing a code must never silently opt into alerts");
    assert.equal(calls.submit.length,0,"seeker actions must not create public Issues");
    assert.equal((await post(callback(703,"t:need:alerts"))).status,200);
    assert.equal(profile().subscribed,true,"explicit opt-in action registers alerts");

    assert.equal((await post(message(704,"🔄 Đổi vai trò"))).status,200);
    assert.equal(sent.at(-1).payload.reply_markup.keyboard[1][0],"🤝 Tôi muốn chia sẻ mã");
    assert.equal((await post(callback(705,"t:role:contributor"))).status,200);
    const contributor=sent.at(-1).payload.reply_markup.keyboard.flat();
    assert.ok(contributor.includes("➕ Đóng góp"));
    assert.ok(contributor.includes("📍 Trạng thái mã"));
    assert.ok(contributor.includes("📋 Mã của tôi"));
    assert.equal(profile().role,"contributor");
    assert.equal(profile().subscribed,true,"switching role must preserve consent and watchlists");
    assert.equal((await post(message(706,"📍 Trạng thái mã"))).status,200);
    assert.match(sent.at(-1).payload.text,/Nhập mã 6 ký tự/);
    assert.equal((await post(message(707,"DPNIHH"))).status,200);
    assert.match(sent.at(-1).payload.text,/đã được công bố/);
    assert.equal(calls.submit.length,0,"role is a menu preference, not proof of ownership");
  });
});
