import test from "node:test";
import assert from "node:assert/strict";
import { LOCALES, LOCALE_NAMES, MENU_KEYS, menuText, tr, normalizeLocale, translationCoverage } from "./i18n.mjs";
import { replyKeyboard,menuChoice,codeButtons,codeDescription } from "./menu.mjs";
import { keyboard,parseCommand,parseUpdate,formatCodeStatus } from "./bot.mjs";
import { cleanProfile, emptyProfile, syncTelegramLocale } from "./profiles.mjs";
import { commandsFor } from "./commands.mjs";
import { publishNotifications } from "./notifications.mjs";

test("all Telegram copy is translated consistently with matching placeholders",()=>{
  assert.deepEqual(LOCALES,["en","vi","ja"]);
  assert.deepEqual(translationCoverage().map(x=>x.missing),[[],[],[]]);
  for(const code of LOCALES){
    assert.equal(replyKeyboard(code).keyboard.length,3);
    assert.deepEqual(replyKeyboard(code).keyboard.map(x=>x.length),[3,3,3]);
    for(const row of MENU_KEYS)for(const key of row){
      const label=menuText(code,key);
      assert.equal(typeof label,"string");
      assert.ok(label.length>2);
      assert.ok(menuChoice(label));
    }
    assert.ok(tr(code,"confirmSubmit",{code:"ABC123"}).includes("ABC123"));
    assert.ok(tr(code,"watching",{code:"ABC123",count:2}).includes("2"));
    assert.ok(tr(code,"notifyMore",{count:5}).includes("5"));
    const buttons=keyboard(codeButtons("DPNIHH",code)).inline_keyboard;
    assert.equal(buttons[0][0].copy_text.text,"DPNIHH");
    assert.equal(buttons[1][0].callback_data,"t:watch:DPNIHH");
    assert.ok(codeDescription({code:"DPNIHH",status:"unverified",remaining:null},code).includes("DPNIHH"));
    const status=formatCodeStatus("DPNIHH",{kind:"listed",status:"unverified",
      reportedRemaining:2,usageReportedAt:"2026-11-15",url:"https://muse.eplus.dev/codes/DPNIHH/"},code);
    assert.ok(status.includes("DPNIHH"));
    assert.ok(status.includes("2026-11-15"));
    assert.ok(status.includes("2"));
    const commandSet=commandsFor(code);
    assert.equal(commandSet.length,20);
    assert.equal(commandSet.find(x=>x.command==="language").command,"language");
    assert.ok(commandSet.every(x=>x.description.length>=3&&x.description.length<=256));
  }
  assert.notEqual(menuText("vi","browse"),menuText("en","browse"));
  assert.notEqual(tr("vi","privacy"),tr("ja","privacy"));
});

test("Telegram language tags auto-select and unknown locale falls back to English",()=>{
  assert.equal(normalizeLocale("vi-VN"),"vi");
  assert.equal(normalizeLocale("ja_JP"),"ja");
  assert.equal(normalizeLocale("fr"),"en");
  assert.equal(normalizeLocale(""),"en");
  assert.equal(parseCommand("/language").type,"choose-language");
  assert.deepEqual(parseCommand("/language vi"),{type:"set-language",language:"vi"});
  assert.deepEqual(parseCommand("/lang ja"),{type:"set-language",language:"ja"});
  assert.equal(parseCommand("/language zz").type,"choose-language");
  assert.equal(parseCommand("🎟 コード取得").type,"browse");
  assert.equal(parseCommand("🎟 Get codes").type,"browse");
  assert.equal(parseCommand("🎟 Nhận mã").type,"browse");
  const data=parseUpdate({update_id:1,message:{text:"/start",from:{id:42,language_code:"vi-VN"},
    chat:{id:42,type:"private"}}});
  assert.equal(data.telegramLanguage,"vi-VN");
  const callback=parseUpdate({update_id:2,callback_query:{id:"abc",data:"t:lang:ja",
    from:{id:42,language_code:"ja"},message:{chat:{id:42,type:"private"}}}});
  assert.equal(callback.type,"set-language");
  assert.equal(callback.language,"ja");
});

test("persist a manually chosen language and never override it from Telegram language_code",async()=>{
  const data=new Map();
  const storage={
    async get(id){return cleanProfile(data.get(id));},
    async set(id,value){data.set(id,value);},
    async delete(id){data.delete(id);}
  };
  assert.deepEqual(await storage.get(42),emptyProfile());
  assert.equal(await syncTelegramLocale(storage,42,"vi-VN"),"vi");
  assert.equal((await storage.get(42)).language,"vi");
  assert.equal(await syncTelegramLocale(storage,42,"ja"),"ja");
  const manual=await storage.get(42);
  manual.language="en";manual.languageManual=true;
  await storage.set(42,manual);
  assert.equal(await syncTelegramLocale(storage,42,"vi-VN"),"en");
  assert.equal((await storage.get(42)).languageManual,true);
});

test("publication notifications match each recipient's saved language",async()=>{
  let baseline=["ABC123"];
  const sent=[];
  const profiles=[
    {chatId:1,profile:{subscribed:true,language:"vi",watching:[],submitted:[]}},
    {chatId:2,profile:{subscribed:true,language:"ja",watching:[],submitted:[]}},
    {chatId:3,profile:{subscribed:true,language:"en",watching:[],submitted:[]}}
  ];
  const state={
    async getBaseline(){return baseline;},
    async setBaseline(value){baseline=value;},
    async listProfiles(){return {profiles,cursor:null};},
    async wasSent(){return false;},
    async markSent(){}
  };
  const result=await publishNotifications({event:{sha:"a".repeat(40)},state,
    catalog:async()=>[{code:"ABC123"},{code:"DEF456"}],
    send:async(id,body)=>sent.push({id,body})});
  assert.equal(result.sent,3);
  assert.ok(sent.find(x=>x.id===1).body.includes("Có mã mời"));
  assert.ok(sent.find(x=>x.id===2).body.includes("新しい"));
  assert.ok(sent.find(x=>x.id===3).body.includes("New Muse"));
});
