import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseWebAppData,parseUpdate} from "./bot.mjs";
import {replyKeyboard} from "./menu.mjs";
import {normalizeInviteCode,platformOf,remainingOf,pageCatalog,buildBotPayload,PAGE_SIZE}
  from "../telegram-app/app.js";

test("Mini App uses native HTTPS keyboard Web App rather than a fake callback",()=>{
  for(const lang of ["en","vi","ja"]){
    for(const role of [null,"seeker","contributor","legacy"]){
      const keyboard=replyKeyboard(lang,role);
      const launcher=keyboard.keyboard.at(-1)[0];
      assert.equal(typeof launcher,"object");
      assert.equal(launcher.web_app.url,"https://muse.eplus.dev/telegram-app/?lang="+lang);
    }
  }
});

test("catalog pages are bounded, searchable, and preserve real dated counts",()=>{
  const rows=Array.from({length:11},(_,i)=>({
    code:"CODE"+String(i).padStart(2,"0"),addedAt:"2026-11-"+String(i+1).padStart(2,"0"),
    status:"unverified",reportedCapacity:30,reportedUses:i,
    usageReportedAt:"2026-11-15"
  }));
  assert.equal(PAGE_SIZE,5);
  const first=pageCatalog(rows,{page:0});
  assert.equal(first.entries.length,5);
  assert.equal(first.total,11);
  assert.equal(first.entries[0].code,"CODE10");
  const second=pageCatalog(rows,{page:1});
  assert.equal(second.entries[0].code,"CODE05");
  assert.equal(second.hasPrev,true);
  assert.equal(second.hasNext,true);
  const last=pageCatalog(rows,{page:50});
  assert.equal(last.page,2);
  assert.equal(last.entries.length,1);
  assert.equal(last.hasNext,false);
  assert.equal(pageCatalog(rows,{query:"CODE03"}).total,1);
  assert.equal(pageCatalog(rows,{query:"missing"}).total,0);
  assert.equal(remainingOf(rows[0]),30);
  assert.equal(remainingOf({...rows[0],usageReportedAt:null}),null);
  assert.equal(remainingOf({reportedRemaining:0,usageReportedAt:"2026-11-15"}),0);
  assert.equal(remainingOf({reportedRemaining:7,usageReportedAt:null}),null);
});

test("Mini App platform badges use validated known source hosts only",()=>{
  assert.equal(platformOf({}),"GitHub");
  assert.equal(platformOf({sourceUrl:"https://www.threads.com/@x/post/abc"}),"Threads");
  assert.equal(platformOf({sourceUrl:"https://x.com/user/status/123"}),"X");
  assert.equal(platformOf({sourceUrl:"https://www.facebook.com/abc/posts/123"}),"Facebook");
  assert.equal(platformOf({sourceUrl:"https://x.com.bad.test/status/123"}),"GitHub");
});

test("Mini App sendData never submits directly or trusts an invalid code or action",()=>{
  assert.equal(normalizeInviteCode("abc123"),"ABC123");
  for(const value of ["ABCDE","ABCD123","AB-123","A B123","<script>",""]){
    assert.equal(normalizeInviteCode(value),"");
  }
  const submit=buildBotPayload("submit",{code:"abc123"});
  assert.deepEqual(parseWebAppData(submit),{type:"confirm-submit",code:"ABC123"});
  assert.deepEqual(parseWebAppData(buildBotPayload("report",{code:"ABC123",result:"worked"})),
    {type:"confirm-report",code:"ABC123",result:"worked"});
  assert.deepEqual(parseWebAppData(buildBotPayload("language",{language:"ja"})),
    {type:"set-language",language:"ja"});
  assert.deepEqual(parseWebAppData(buildBotPayload("my")),{type:"my-codes"});
  assert.deepEqual(parseWebAppData(buildBotPayload("notifications")),{type:"notifications"});
  assert.deepEqual(parseWebAppData(buildBotPayload("get",{code:"ABC123"})),
    {type:"get",code:"ABC123"});
  assert.throws(()=>buildBotPayload("submit",{code:"BAD"}));
  assert.throws(()=>buildBotPayload("report",{code:"ABC123",result:"maybe"}));
  assert.throws(()=>buildBotPayload("delete-data"));
  assert.equal(parseWebAppData(JSON.stringify({v:1,action:"submit",code:"BAD"})).type,"usage-submit");
  assert.equal(parseWebAppData(JSON.stringify({v:1,action:"report",code:"ABC123",result:"maybe"})).type,"usage-report");
  assert.equal(parseWebAppData(JSON.stringify({v:1,action:"delete-data"})).type,"help");
  assert.equal(parseWebAppData("not-json").type,"help");
  assert.equal(parseWebAppData("x".repeat(300)).type,"help");
});

test("Mini App service messages are private only and require Telegram-side confirmation",()=>{
  const update=(id,data,chatType="private")=>({update_id:id,message:{
    from:{id:42,is_bot:false},chat:{id:42,type:chatType},
    web_app_data:{data}
  }});
  const action=parseUpdate(update(9,buildBotPayload("submit",{code:"ABC123"})));
  assert.equal(action.chatId,42);
  assert.equal(action.type,"confirm-submit");
  assert.equal(action.code,"ABC123");
  assert.equal(parseUpdate(update(10,buildBotPayload("submit",{code:"ABC123"}),"group")).type,"private-only");
  assert.equal(parseUpdate({update_id:11,message:{
    from:{id:42,is_bot:true},chat:{id:42,type:"private"},
    web_app_data:{data:buildBotPayload("submit",{code:"ABC123"})}
  }}),null);
});

test("Mini App is a real noindex static HTML/CSS/JS page with no embedded credentials",()=>{
  const html=readFileSync(new URL("../telegram-app/index.html",import.meta.url),"utf8");
  const css=readFileSync(new URL("../telegram-app/styles.css",import.meta.url),"utf8");
  const js=readFileSync(new URL("../telegram-app/app.js",import.meta.url),"utf8");
  const pages=readFileSync(new URL("../scripts/build-pages.mjs",import.meta.url),"utf8");
  assert.match(html,/noindex,nofollow,noarchive/);
  assert.match(html,/telegram-web-app\.js/);
  assert.match(html,/\.\/app\.js/);
  assert.match(html,/\.\/styles\.css/);
  assert.match(pages,/telegram-app\/index\.html/);
  assert.match(css,/bottom-nav/);
  assert.match(js,/TelegramWebviewProxy/);
  assert.doesNotMatch(js,/GITHUB_ISSUES_TOKEN|TELEGRAM_BOT_TOKEN|\bsk-[A-Za-z0-9]{20}/);
  assert.doesNotMatch(html,/sk-proj-\\S+/);
});
