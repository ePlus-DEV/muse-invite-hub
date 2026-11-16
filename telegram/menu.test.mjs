import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand, parseUpdate, keyboard } from "./bot.mjs";
import { REPLY_KEYBOARD, MENU, codeButtons, codeDescription } from "./menu.mjs";
import { cleanProfile, emptyProfile, mutateProfile } from "./profiles.mjs";
import { resolveInput, handleInteractive } from "./conversation.mjs";

function fixture() {
  const data=new Map(),messages=[];
  const profiles={
    async get(id){return cleanProfile(data.get(String(id)));},
    async set(id,v){data.set(String(id),v);},
    async delete(id){data.delete(String(id));}
  };
  const services={
    browseCodes:async({query="",newest=false})=>query&&!String("DPNIHH").toLowerCase().includes(query.toLowerCase())?[]:[
      {code:"DPNIHH",status:"unverified",remaining:23,usageReportedAt:"2026-11-15"}],
    getCodeStatus:async(code)=>({kind:code==="DPNIHH"?"listed":"pending",
      url:"https://muse.eplus.dev/codes/"+code+"/"})
  };
  const calls={
    profiles,
    services,
    githubToken:"test-issues-token",
    send:async(chat,text,buttons)=>messages.push({chat,text,buttons}),
    sendMenu:async(chat,text)=>messages.push({chat,text,menu:REPLY_KEYBOARD})
  };
  const run=async(input)=>{
    const parsed=parseCommand(input);
    const action=await resolveInput({chatId:42,...parsed},profiles);
    const handled=await handleInteractive({action,...calls});
    return {action,handled};
  };
  return {run,profiles,messages,data,calls};
}

test("persistent keyboard retains all nine core actions plus a distinct Refresh row",()=>{
  assert.equal(MENU.length,4);
  assert.deepEqual(MENU.map(row=>row.length),[3,3,3,1]);
  assert.equal(MENU.flat().length,new Set(MENU.flat()).size);
  assert.equal(REPLY_KEYBOARD.is_persistent,true);
  assert.equal(REPLY_KEYBOARD.keyboard[0][0],"🎟 Get codes");
  assert.equal(MENU[0][0],"🎟 Get codes");
  assert.equal(MENU[3][0],"🔄 Refresh");
  assert.equal(parseCommand("🔄 Refresh").type,"refresh");
  assert.equal(parseCommand("🔄 Làm mới").type,"refresh");
  assert.equal(parseCommand("🔄 更新").type,"refresh");
  assert.equal(parseCommand("/refresh").type,"refresh");
  assert.equal(parseCommand("🎟 Nhận mã").type,"browse");
  assert.equal(parseCommand("/subscribe").type,"subscribe");
  assert.equal(parseCommand("/watchlist").type,"watchlist");
  assert.equal(parseCommand("➕ Đóng góp").type,"prompt-submit");
  assert.equal(parseCommand("🔔 Thông báo").type,"notifications");
  assert.equal(parseCommand("/codes").type,"browse");
  assert.equal(parseCommand("/get dpnihh").code,"DPNIHH");
  assert.equal(parseCommand("/search David").query,"David");
  assert.equal(parseCommand("/watch DPNI").type,"usage-code");
  assert.equal(parseCommand("/delete_data").type,"delete-data");
});

test("Telegram copy-text button is native and code actions are private callbacks",()=>{
  const rows=codeButtons("DPNIHH");
  const payload=keyboard(rows);
  assert.deepEqual(payload.inline_keyboard[0][0].copy_text,{text:"DPNIHH"});
  assert.equal(payload.inline_keyboard[0][0].url,undefined);
  assert.equal(payload.inline_keyboard[1][0].callback_data,"t:watch:DPNIHH");
  assert.equal(payload.inline_keyboard[2][0].callback_data,"t:refresh-code:DPNIHH");
  assert.equal(payload.inline_keyboard[3][0].callback_data,"t:back-list");
  assert.equal(payload.inline_keyboard[3][1].callback_data,"t:home");
  const callback=(data)=>parseUpdate({update_id:10,callback_query:{
    id:"id",from:{id:42},message:{chat:{type:"private",id:42}},data
  }});
  assert.equal(callback("t:watch:DPNIHH").type,"watch");
  assert.equal(callback("t:pick:DPNIHH:worked").type,"confirm-report");
  assert.equal(callback("t:sub:on").type,"subscribe");
  assert.equal(callback("t:erase:confirm").type,"delete-confirm");
  assert.equal(callback("t:detail:DPNIHH").type,"detail");
  assert.equal(callback("t:detail:DPNIHH").code,"DPNIHH");
  assert.equal(callback("t:page:1").type,"page");
  assert.equal(callback("t:page:1").page,1);
  assert.equal(callback("t:page:100").type,"cancel");
  assert.equal(callback("t:back-list").type,"back-list");
  assert.equal(callback("t:home").type,"home");
  assert.deepEqual(
    {type:callback("t:refresh-code:DPNIHH").type,code:callback("t:refresh-code:DPNIHH").code},
    {type:"refresh-code",code:"DPNIHH"});
  assert.match(codeDescription({code:"DPNIHH",status:"unverified",remaining:null}),/Not reported/);
  assert.throws(()=>codeDescription({code:"BAD"}),/Invalid/);
});

test("menu search, contribute and report prompt resolve only one six-character code",async()=>{
  const f=fixture();
  await f.run("🔎 Tìm mã");
  assert.match(f.messages.at(-1).text,/Enter a code/);
  assert.deepEqual((await f.run("DPNIHH")).action.type,"search");
  assert.equal((await f.profiles.get(42)).pending,null);
  await f.run("➕ Đóng góp");
  assert.equal((await f.run("invalid!")).action.type,"invalid-input");
  assert.equal((await f.profiles.get(42)).pending.type,"submit");
  assert.deepEqual((await f.run("abc123")).action,{chatId:42,type:"confirm-submit",code:"ABC123",text:"abc123"});
  await f.run("✅ Báo cáo");
  assert.equal((await f.run("dpnihh")).action.type,"report-choose");
  assert.equal(f.messages.at(-1).buttons[0][0].data,"t:pick:DPNIHH:worked");
});

test("menu supports browse, get, watch, notification preference, deletion",async()=>{
  const f=fixture();
  await f.run("/start");
  assert.equal(f.messages.at(-1).menu.is_persistent,true);
  await f.run("🎟 Nhận mã");
  assert.match(f.messages.at(-1).text,/DPNIHH/);
  await f.run("/get DPNIHH");
  assert.equal(f.messages.at(-1).buttons[0][0].copy_text.text,"DPNIHH");
  await f.run("/watch DPNIHH");
  assert.deepEqual((await f.profiles.get(42)).watching,["DPNIHH"]);
  await f.run("📌 Theo dõi");
  assert.match(f.messages.at(-1).text,/DPNIHH/);
  await f.run("/subscribe");
  assert.equal((await f.profiles.get(42)).subscribed,true);
  await f.run("🔔 Thông báo");
  assert.match(f.messages.at(-1).text,/ON/);
  await f.run("/unsubscribe");
  assert.equal((await f.profiles.get(42)).subscribed,false);
  await f.run("/delete_data");
  assert.match(f.messages.at(-1).text,/NOT delete public GitHub Issues/);
  await handleInteractive({action:{type:"delete-confirm",chatId:42},...f.calls});
  assert.deepEqual(await f.profiles.get(42),emptyProfile());
});

test("Refresh fetches the latest catalog again without creating pending submissions",async()=>{
  const f=fixture();
  let reads=0;
  f.calls.services.browseCodes=async()=>{
    reads++;
    return [{code:"DPNIHH",status:"unverified",remaining:reads,
      usageReportedAt:"2026-11-15"}];
  };
  await f.run("➕ Đóng góp");
  assert.equal((await f.profiles.get(42)).pending.type,"submit");
  assert.equal((await f.run("🔄 Refresh")).action.type,"refresh");
  assert.equal((await f.profiles.get(42)).pending,null,
    "Refresh cancels stale text entry so a later code is not submitted accidentally");
  assert.equal(reads,1);
  assert.match(f.messages.at(-1).text,/Reported 1 remaining/);
  assert.equal((await f.run("/refresh")).action.type,"refresh");
  assert.equal(reads,2);
  assert.match(f.messages.at(-1).text,/Reported 2 remaining/);
  assert.equal(f.messages.at(-1).buttons[1][0].data,"t:refresh");
  assert.equal(await handleInteractive({action:{type:"refresh-code",chatId:42,code:"DPNIHH"},...f.calls}),true);
  assert.equal(reads,3);
  assert.match(f.messages.at(-1).text,/Reported 3 remaining/);
});

test("paged list -> code detail -> back to same page -> home without public writes",async()=>{
  const f=fixture();
  const rows=Array.from({length:12},(_,i)=>({
    code:"CODE"+String(i).padStart(2,"0"),status:"unverified",
    remaining:12-i,usageReportedAt:"2026-11-15",
    platform:i===5?"Threads":"GitHub",
    addedAt:"2026-11-11",
    submittedBy:i===5?null:"example-user"
  }));
  const requests=[];
  f.calls.services.browseCodes=async({offset=0,limit=5,query=""})=>{
    requests.push({offset,limit,query});
    return rows.filter(x=>!query||x.code.includes(query)).slice(offset,offset+limit);
  };
  await f.run("/codes");
  assert.equal(f.messages.length,1,"Pagination must avoid sending five separate code messages");
  assert.equal(f.messages.at(-1).buttons[0][0].data,"t:detail:CODE00");
  assert.equal(f.messages.at(-1).buttons[5][0].data,"t:page:1");
  assert.equal(f.messages.at(-1).buttons[6][1].data,"t:home");
  assert.equal((await f.profiles.get(42)).browse.page,0);
  assert.equal(await handleInteractive({action:{type:"page",page:1,chatId:42},...f.calls}),true);
  assert.equal(requests.at(-1).offset,5);
  assert.equal(f.messages.at(-1).buttons[0][0].data,"t:detail:CODE05");
  assert.equal(f.messages.at(-1).buttons[5][0].data,"t:page:0");
  assert.equal(f.messages.at(-1).buttons[5][1].data,"t:page:2");
  assert.equal(await handleInteractive({action:{type:"detail",code:"CODE05",chatId:42},...f.calls}),true);
  assert.match(f.messages.at(-1).text,/Platform: Threads/);
  assert.match(f.messages.at(-1).text,/Added: 2026-11-11/);
  assert.equal(f.messages.at(-1).buttons[3][0].data,"t:back-list");
  assert.equal(await handleInteractive({action:{type:"back-list",chatId:42},...f.calls}),true);
  assert.equal(requests.at(-1).offset,5);
  assert.equal(f.messages.at(-1).buttons[0][0].data,"t:detail:CODE05");
  assert.equal(await handleInteractive({action:{type:"page",page:2,chatId:42},...f.calls}),true);
  assert.equal(f.messages.at(-1).buttons.length,4,"Last page has two codes, Prev and Home/Refresh");
  assert.equal(await handleInteractive({action:{type:"home",chatId:42},...f.calls}),true);
  assert.equal(f.messages.at(-1).menu.is_persistent,true);
  assert.equal((await f.profiles.get(42)).browse.page,2);
});

test("search pagination retains private query and handles catalog shrinking",async()=>{
  const f=fixture();
  let rows=Array.from({length:7},(_,i)=>({code:"TEST"+String(i).padStart(2,"0"),status:"unverified",remaining:null}));
  f.calls.services.browseCodes=async({query="",offset=0,limit=6})=>rows.filter(e=>e.code.includes(query)).slice(offset,offset+limit);
  await f.run("/search TEST");
  assert.equal((await f.profiles.get(42)).browse.query,"TEST");
  assert.equal(await handleInteractive({action:{type:"page",page:1,chatId:42},...f.calls}),true);
  assert.match(f.messages.at(-1).text,/Page 2/);
  rows=rows.slice(0,2);
  assert.equal(await handleInteractive({action:{type:"back-list",chatId:42},...f.calls}),true);
  assert.match(f.messages.at(-1).text,/Page 1/);
  assert.equal((await f.profiles.get(42)).browse.page,0);
});

test("private chat history tracks Issue links but never asserts ownership",async()=>{
  const f=fixture();
  await mutateProfile(f.profiles,42,p=>{
    p.submitted=[{code:"TEST42",url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/400"}];
    return p;
  });
  await f.run("📋 Mã của tôi");
  assert.match(f.messages.at(-1).text,/not proof of code ownership/);
  assert.match(f.messages.at(-1).text,/issues\/400/);
  const clean=cleanProfile({submitted:[{code:"SECRET",url:"https://evil.example/x"}]});
  assert.deepEqual(clean.submitted,[]);
});
