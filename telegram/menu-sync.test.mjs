import test from "node:test";
import assert from "node:assert/strict";
import {menuVersion,createMenuSync} from "./menu-sync.mjs";
import {cleanProfile,emptyProfile} from "./profiles.mjs";
import {replyKeyboard} from "./menu.mjs";

function fixture(initial=null) {
  let stored=initial?cleanProfile(initial):emptyProfile();
  const messages=[];
  const profiles={
    async get(){return cleanProfile(stored);},
    async set(_id,value){stored=cleanProfile(value);},
    async delete(){stored=emptyProfile();}
  };
  const sendMenu=async(chat,text,language,role)=>{
    messages.push({chat,text,language,role,keyboard:replyKeyboard(language,role)});
    return {message_id:100+messages.length};
  };
  return {profiles,messages,sendMenu};
}

test("menu fingerprint is deterministic, tracks role / language and not unrelated data",()=>{
  const a=menuVersion("vi","seeker");
  assert.match(a,/^v1-[0-9a-f]{8}$/);
  assert.equal(a,menuVersion("vi","seeker"));
  assert.notEqual(a,menuVersion("vi","contributor"));
  assert.notEqual(a,menuVersion("en","seeker"));
  assert.notEqual(menuVersion("en",null),menuVersion("en","legacy"));
  assert.equal(cleanProfile({menuVersion:a,watching:["ABC123"]}).menuVersion,a);
  assert.equal(cleanProfile({menuVersion:"arbitrary"}).menuVersion,null);
  assert.equal(emptyProfile().menuVersion,null);
});

test("legacy keyboard tap migrates once and preserves existing profile",async()=>{
  const f=fixture({language:"vi",languageManual:true,role:"seeker",
    watching:["DPNIHH"],subscribed:true,panelMessageId:234});
  const action={type:"browse",fromMenu:true,chatId:42};
  const first=createMenuSync({...f,action,priorProfile:await f.profiles.get(42)});
  assert.equal(await first.syncIfNeeded(42),true);
  assert.equal(await first.syncIfNeeded(42),false);
  assert.equal(f.messages.length,1);
  assert.match(f.messages[0].text,/Đã tự động/);
  assert.equal(f.messages[0].keyboard.keyboard[0][0],"🎟 Nhận mã");
  const profile=await f.profiles.get(42);
  assert.equal(profile.menuVersion,menuVersion("vi","seeker"));
  assert.deepEqual(profile.watching,["DPNIHH"]);
  assert.equal(profile.subscribed,true);
  assert.equal(profile.panelMessageId,234);
  const next=createMenuSync({...f,action,priorProfile:profile});
  assert.equal(await next.syncIfNeeded(42),false);
  assert.equal(f.messages.length,1);
});

test("explicit menu sends and language/role changes do not double-send",async()=>{
  const f=fixture({role:"seeker",language:"en"});
  const current=await f.profiles.get(42);
  const sync=createMenuSync({...f,action:{type:"help",chatId:42},priorProfile:current});
  await sync.trackedSendMenu(42,"Welcome","en","seeker");
  assert.equal(await sync.syncIfNeeded(42),false);
  assert.equal(f.messages.length,1);
  assert.equal((await f.profiles.get(42)).menuVersion,menuVersion("en","seeker"));
  const change=createMenuSync({...f,action:{type:"set-language",chatId:42},
    priorProfile:await f.profiles.get(42)});
  await change.trackedSendMenu(42,"Language changed","ja","seeker");
  assert.equal(await change.syncIfNeeded(42),false);
  assert.equal((await f.profiles.get(42)).menuVersion,menuVersion("ja","seeker"));
  assert.equal(f.messages.length,2);
});

test("first-time API-only chat does not receive a ghost menu; old buttons do",async()=>{
  const f=fixture();
  const action={type:"status",chatId:42};
  const fresh=createMenuSync({...f,action,priorProfile:await f.profiles.get(42)});
  assert.equal(await fresh.syncIfNeeded(42),false);
  assert.equal(f.messages.length,0);
  const fromButton=createMenuSync({...f,action:{type:"browse",chatId:42,fromMenu:true},
    priorProfile:await f.profiles.get(42)});
  assert.equal(await fromButton.syncIfNeeded(42),true);
  assert.equal(f.messages.length,1);
  assert.equal(f.messages[0].keyboard.keyboard.length,3);
});

test("failed sync does not record version or throw after business action",async()=>{
  const f=fixture({role:"contributor",menuVersion:"v1-deadbeef"});
  const sync=createMenuSync({profiles:f.profiles,action:{type:"browse",chatId:42},
    priorProfile:await f.profiles.get(42),
    sendMenu:async()=>{throw Error("Telegram timeout");}});
  assert.equal(await sync.syncIfNeeded(42),false);
  assert.equal((await f.profiles.get(42)).menuVersion,"v1-deadbeef");
  const retry=createMenuSync({...f,action:{type:"browse",chatId:42},
    priorProfile:await f.profiles.get(42)});
  assert.equal(await retry.syncIfNeeded(42),true);
  assert.equal(f.messages.length,1);
});

test("deleting private bot data does not recreate a stored profile",async()=>{
  const f=fixture({role:"seeker",watching:["DPNIHH"]});
  const sync=createMenuSync({...f,action:{type:"delete-confirm",chatId:42},
    priorProfile:await f.profiles.get(42)});
  await f.profiles.delete(42);
  await sync.trackedSendMenu(42,"Deleted","en",null);
  assert.equal(await sync.syncIfNeeded(42),false);
  assert.deepEqual(await f.profiles.get(42),emptyProfile());
});
