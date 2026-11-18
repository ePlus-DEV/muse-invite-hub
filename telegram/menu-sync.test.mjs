import test from "node:test";
import assert from "node:assert/strict";
import {menuVersion,createMenuSync} from "./menu-sync.mjs";
import {cleanProfile,emptyProfile} from "./profiles.mjs";
import {replyKeyboard} from "./menu.mjs";

function fixture(initial=null) {
  let stored=initial?cleanProfile(initial):emptyProfile();
  const messages=[],removed=[];
  const profiles={
    async get(){return cleanProfile(stored);},
    async set(_id,value){stored=cleanProfile(value);},
    async delete(){stored=emptyProfile();}
  };
  const sendMenu=async(chat,text,language,role)=>{
    messages.push({chat,text,language,role,keyboard:replyKeyboard(language,role)});
    return {message_id:100+messages.length};
  };
  const removeMessage=async(chat,id)=>{removed.push([chat,id]);};
  return {profiles,messages,sendMenu,removeMessage,removed};
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

test("stale keyboard version syncs silently and replaces the old panel",async()=>{
  const f=fixture({language:"vi",languageManual:true,role:"seeker",
    watching:["DPNIHH"],subscribed:true,panelMessageId:234});
  const action={type:"browse",fromMenu:true,chatId:42};
  const first=createMenuSync({...f,action});
  assert.equal(await first.syncIfNeeded(42),false);
  assert.equal(await first.syncIfNeeded(42),false);
  assert.equal(f.messages.length,0,
    "Sync must never send a standalone 'menu updated' message");
  assert.deepEqual(f.removed,[[42,234]],
    "The panel from the older menu era is deleted, not left in the chat");
  const profile=await f.profiles.get(42);
  assert.equal(profile.menuVersion,menuVersion("vi","seeker"));
  assert.deepEqual(profile.watching,["DPNIHH"]);
  assert.equal(profile.subscribed,true);
  assert.equal(profile.panelMessageId,null,
    "The action will open a fresh panel at the current chat position");
  const next=createMenuSync({...f,action});
  assert.equal(await next.syncIfNeeded(42),false);
  assert.equal(f.messages.length,0);
  assert.equal(f.removed.length,1,"Migration happens once, not on every tap");
});

test("current menu version leaves the open panel untouched",async()=>{
  const f=fixture({language:"en",role:"seeker",panelMessageId:234,
    menuVersion:menuVersion("en","seeker")});
  const sync=createMenuSync({...f,action:{type:"browse",fromMenu:true,chatId:42}});
  assert.equal(await sync.syncIfNeeded(42),false);
  assert.equal(f.removed.length,0);
  assert.equal((await f.profiles.get(42)).panelMessageId,234);
});

test("a fresh menu message deletes the previous panel instead of abandoning it",async()=>{
  const f=fixture({role:"seeker",language:"en",panelMessageId:777});
  const sync=createMenuSync({...f,action:{type:"home",chatId:42}});
  await sync.trackedSendMenu(42,"Welcome","en","seeker");
  assert.deepEqual(f.removed,[[42,777]]);
  const profile=await f.profiles.get(42);
  assert.equal(profile.panelMessageId,null);
  assert.equal(profile.menuVersion,menuVersion("en","seeker"));
  // A panel that is already gone must not break the menu send.
  const g=fixture({role:"seeker",language:"en",panelMessageId:888});
  g.removeMessage=async()=>{throw Error("message can't be deleted");};
  const tolerant=createMenuSync({...g,action:{type:"home",chatId:42}});
  await tolerant.trackedSendMenu(42,"Welcome","en","seeker");
  assert.equal((await g.profiles.get(42)).panelMessageId,null);
});

test("explicit menu sends and language/role changes do not double-send",async()=>{
  const f=fixture({role:"seeker",language:"en"});
  const current=await f.profiles.get(42);
  const sync=createMenuSync({...f,action:{type:"help",chatId:42},priorProfile:current});
  await sync.trackedSendMenu(42,"Welcome","en","seeker");
  assert.equal(await sync.syncIfNeeded(42),false);
  assert.equal(f.messages.length,1);
  assert.equal((await f.profiles.get(42)).menuVersion,menuVersion("en","seeker"));
  assert.equal((await f.profiles.get(42)).panelMessageId,null);
  const change=createMenuSync({...f,action:{type:"set-language",chatId:42},
    priorProfile:await f.profiles.get(42)});
  await change.trackedSendMenu(42,"Language changed","ja","seeker");
  assert.equal(await change.syncIfNeeded(42),false);
  assert.equal((await f.profiles.get(42)).menuVersion,menuVersion("ja","seeker"));
  assert.equal(f.messages.length,2);
});

test("sync sends nothing for first-time chats or old-button taps",async()=>{
  const f=fixture();
  const action={type:"status",chatId:42};
  const fresh=createMenuSync({...f,action});
  assert.equal(await fresh.syncIfNeeded(42),false);
  assert.equal(f.messages.length,0);
  assert.equal((await f.profiles.get(42)).menuVersion,menuVersion("en",null),
    "Recording the fingerprint is harmless: no message is ever sent");
  const fromButton=createMenuSync({...f,action:{type:"browse",chatId:42,fromMenu:true}});
  assert.equal(await fromButton.syncIfNeeded(42),false);
  assert.equal(f.messages.length,0);
});

test("failed version bookkeeping does not throw or block the business action",async()=>{
  const f=fixture({role:"contributor",menuVersion:"v1-deadbeef"});
  const broken={
    async get(id){return f.profiles.get(id);},
    async set(){throw Error("store unavailable");},
    async delete(){}
  };
  const sync=createMenuSync({profiles:broken,sendMenu:f.sendMenu,
    removeMessage:f.removeMessage,action:{type:"browse",chatId:42}});
  assert.equal(await sync.syncIfNeeded(42),false);
  assert.equal(f.messages.length,0);
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
