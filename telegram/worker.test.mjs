import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleWebhookRequest, createKvState } from "./worker.mjs";

const token = "123456789012345678901234567890";
const secret = "0123456789abcdef0123456789abcdef";
const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

class FakeKv {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.has(key) ? this.map.get(key) : null; }
  async put(key, value) { this.map.set(key, value); }
  async delete(key) { this.map.delete(key); }
}

function makeEnv(kv = new FakeKv()) {
  return {
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_WEBHOOK_SECRET: secret,
    GITHUB_ISSUES_TOKEN: "issue-token-test",
    BOT_STATE: kv
  };
}

function makeDeps(services = {}) {
  const sent = [], calls = { submit: [], report: [] };
  const defaults = {
    listRecentCodes: async () => ["DPNIHH", "TEST42"],
    browseCodes: async () => [
      {code:"DPNIHH",status:"unverified",remaining:23,basis:"reported",
        usageReportedAt:"2026-11-15",platform:"GitHub"},
      {code:"AUYL1M",status:"unverified",remaining:30,basis:"default",
        usageReportedAt:null,platform:"GitHub"}
    ],
    getCodeStatus: async code => ({kind:"listed",status:"unverified",reportedRemaining:23,
      usageReportedAt:"2026-11-15",url:"https://muse.eplus.dev/codes/"+code+"/"}),
    submitNewCode: async (...args) => { calls.submit.push(args); return { kind: "submitted", url: "https://github.com/ePlus-DEV/muse-invite-hub/issues/90" }; },
    submitFeedback: async (...args) => { calls.report.push(args); return { kind: "reported", url: "https://github.com/ePlus-DEV/muse-invite-hub/issues/14" }; }
  };
  return {
    sent, calls,
    deps: {
      telegramApi: async (name, payload) => sent.push({ name, payload }),
      services: { ...defaults, ...services }
    }
  };
}

const webhook = (update, override = {}) => new Request("https://bot.example.com/telegram/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret, ...override },
  body: typeof update === "string" ? update : JSON.stringify(update)
});
const message = (id, text) => ({ update_id: id, message: { text, from: { id: 42, is_bot: false, username: "alice_dev" }, chat: { id: 42, type: "private" } } });
const callback = (id, data, panelId = id+100) => ({ update_id: id, callback_query: { id: "cb-" + id, data, from: { id: 42, username: "alice_dev" }, message: { message_id: panelId, chat: { id: 42, type: "private" } } } });

test("worker checks method, path, JSON and constant-time shared secret", async () => {
  const env = makeEnv();
  const { deps } = makeDeps();
  assert.equal((await handleWebhookRequest(new Request("https://bot.example.com/healthz"), env, deps)).status, 200);
  const versionEnv={...env,BUILD_SHA:"a".repeat(40)};
  const version=await handleWebhookRequest(new Request("https://bot.example.com/version"),versionEnv,deps);
  assert.equal(version.status,200);
  assert.deepEqual(await version.json(),{revision:"a".repeat(40)});
  assert.equal((await handleWebhookRequest(new Request("https://bot.example.com/telegram/webhook"), env, deps)).status, 404);
  assert.equal((await handleWebhookRequest(webhook(message(1, "/start"), { "X-Telegram-Bot-Api-Secret-Token": "totally-wrong-secret" }), env, deps)).status, 403);
  assert.equal((await handleWebhookRequest(webhook(message(1, "/start"), { "Content-Type": "text/plain" }), env, deps)).status, 415);
  assert.equal((await handleWebhookRequest(webhook({ update_id: "bad" }), env, deps)).status, 400);
  assert.equal((await handleWebhookRequest(webhook("x".repeat(33 * 1024)), env, deps)).status, 413);
  assert.equal((await handleWebhookRequest(webhook(message(1, "/start")), env, deps)).status, 200);
  const unconfigured = makeEnv();
  delete unconfigured.GITHUB_ISSUES_TOKEN;
  assert.equal((await handleWebhookRequest(webhook(message(2, "/start")), unconfigured, deps)).status, 500);
});

test("submit and report are explicitly confirmed, then sent to GitHub once", async () => {
  const env = makeEnv();
  const { deps, sent, calls } = makeDeps();
  assert.equal((await handleWebhookRequest(webhook(message(10, "/submit TEST42")), env, deps)).status, 200);
  assert.equal(calls.submit.length, 0, "Typing a code must not create a public Issue without consent");
  assert.match(sent.at(-1).payload.text, /PUBLIC GitHub Issue/);
  assert.equal((await handleWebhookRequest(webhook(callback(11, "t:submit:TEST42")), env, deps)).status, 200);
  assert.equal(calls.submit.length, 1);
  assert.deepEqual(calls.submit[0], ["TEST42", 11, "issue-token-test", "alice_dev"]);
  assert.equal(sent.at(-1).name,"editMessageReplyMarkup");
  assert.deepEqual(sent.at(-1).payload.reply_markup,{inline_keyboard:[]});
  assert.equal((await handleWebhookRequest(webhook(callback(11, "t:submit:TEST42")), env, deps)).status, 200);
  assert.equal(calls.submit.length, 1, "Repeated Telegram delivery is idempotent via KV dedup");
  assert.equal((await handleWebhookRequest(webhook(message(12, "/report DPNIHH worked")), env, deps)).status, 200);
  assert.equal(calls.report.length, 0);
  assert.equal((await handleWebhookRequest(webhook(callback(13, "t:report:DPNIHH:worked")), env, deps)).status, 200);
  assert.equal(calls.report.length, 1);
  assert.deepEqual(calls.report[0], ["DPNIHH", "worked", 13, "issue-token-test"]);
  const state = createKvState(env.BOT_STATE);
  for (const id of [10, 11, 12, 13]) assert.equal(await state.has(id), true);
});

test("closed Telegram contribution Issues are not reported as pending",async()=>{
  const env=makeEnv();
  const {deps,sent}=makeDeps({
    submitNewCode:async()=>({kind:"closed",url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/43"})
  });
  assert.equal((await handleWebhookRequest(webhook(message(270,"/submit CLOSED")),env,deps)).status,200);
  assert.equal((await handleWebhookRequest(webhook(callback(271,"t:submit:CLOSED")),env,deps)).status,200);
  assert.match(sent.findLast(x=>x.name==="sendMessage").payload.text,/previous Issue.*closed/i);
  assert.match(sent.findLast(x=>x.name==="sendMessage").payload.text,/issues\/43/);
});

test("Worker blocks non-attributed public code submissions before GitHub writes",async()=>{
  const env=makeEnv();
  const {deps,sent,calls}=makeDeps();
  const noUser=message(850,"/submit ABC123");
  delete noUser.message.from.username;
  assert.equal((await handleWebhookRequest(webhook(noUser),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/set a public Telegram @username/);
  assert.equal(calls.submit.length,0);
  const noUserConfirm=callback(851,"t:submit:ABC123");
  delete noUserConfirm.callback_query.from.username;
  assert.equal((await handleWebhookRequest(webhook(noUserConfirm),env,deps)).status,200);
  assert.equal(calls.submit.length,0);
  assert.equal((await handleWebhookRequest(webhook(message(852,"/submit ABC123")),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/@alice_dev/);
  assert.equal((await handleWebhookRequest(webhook(callback(853,"t:submit:ABC123")),env,deps)).status,200);
  assert.deepEqual(calls.submit[0],["ABC123",853,"issue-token-test","alice_dev"]);
});

test("Worker Refresh fetches current catalog and has no public write side effects",async()=>{
  const env=makeEnv();
  let reads=0;
  const {deps,sent,calls}=makeDeps({browseCodes:async()=>{
    reads++;
    return [{code:"DPNIHH",status:"unverified",remaining:reads,usageReportedAt:"2026-11-15"}];
  }});
  assert.equal((await handleWebhookRequest(webhook(message(300,"/start")),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard.length,3);
  assert.equal((await handleWebhookRequest(webhook(callback(301,"t:role:contributor")),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard.length,2);
  assert.equal((await handleWebhookRequest(webhook(message(302,"🔄 Refresh")),env,deps)).status,200);
  assert.equal(reads,1);
  assert.match(sent.at(-1).payload.reply_markup.inline_keyboard[0][0].text,/1 /);
  assert.equal((await handleWebhookRequest(webhook(message(303,"/refresh")),env,deps)).status,200);
  assert.equal(reads,2);
  assert.match(sent.at(-1).payload.reply_markup.inline_keyboard[0][0].text,/2 /);
  assert.equal((await handleWebhookRequest(webhook(callback(304,"t:refresh-code:DPNIHH")),env,deps)).status,200);
  assert.equal(reads,3);
  assert.equal(sent.at(-2).name,"editMessageText");
  assert.match(sent.at(-2).payload.text,/Reported 3 remaining/);
  assert.equal(sent.at(-1).name,"answerCallbackQuery");
  assert.equal(sent.at(-1).payload.text,"Updated");
  assert.equal(calls.submit.length,0);
  assert.equal(calls.report.length,0);
  assert.equal(await env.BOT_STATE.get("rl:42"),null,"Refreshing must not use public-write quota");
});

test("Worker no-change refresh shows toast without sending a duplicate card",async()=>{
  const env=makeEnv();
  const {deps,sent,calls}=makeDeps({browseCodes:async()=>[
    {code:"DPNIHH",status:"unverified",remaining:23,usageReportedAt:"2026-11-15"}
  ]});
  deps.telegramApi=async (name,payload)=>{
    sent.push({name,payload});
    if(name==="editMessageText")
      throw Error("Telegram editMessageText HTTP 400: Bad Request: message is not modified");
  };
  assert.equal((await handleWebhookRequest(webhook(callback(901,"t:refresh-code:DPNIHH")),env,deps)).status,200);
  assert.deepEqual(sent.map(x=>x.name),["editMessageText","answerCallbackQuery"]);
  assert.equal(sent.at(-1).payload.text,"Already up to date");
  assert.equal(calls.submit.length,0);
  assert.equal(calls.report.length,0);
});

test("Worker paging and code details are navigable without GitHub writes",async()=>{
  const env=makeEnv(),sentMessages=[];
  const items=Array.from({length:8},(_,i)=>({
    code:"PAGE"+String(i).padStart(2,"0"),status:"unverified",
    remaining:i,usageReportedAt:"2026-11-15",addedAt:"2026-11-14",platform:"GitHub"
  }));
  const {deps,sent,calls}=makeDeps({browseCodes:async({offset=0,limit=6,query=""})=>
    items.filter(x=>!query||x.code.includes(query)).slice(offset,offset+limit)});
  assert.equal((await handleWebhookRequest(webhook(message(310,"/codes")),env,deps)).status,200);
  assert.equal(sent.filter(x=>x.name==="sendMessage").length,1);
  assert.equal(sent.at(-1).payload.reply_markup.inline_keyboard[0][0].callback_data,"t:detail:PAGE00");
  assert.equal((await handleWebhookRequest(webhook(callback(311,"t:page:1")),env,deps)).status,200);
  assert.equal(sent.at(-1).name,"editMessageText",
    "Pagination must edit the existing bot message rather than send duplicates");
  assert.match(sent.at(-1).payload.text,/Page 2/);
  assert.equal(sent.at(-1).payload.reply_markup.inline_keyboard[0][0].callback_data,"t:detail:PAGE05");
  assert.equal((await handleWebhookRequest(webhook(callback(312,"t:detail:PAGE05")),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/Platform: GitHub/);
  assert.equal(sent.at(-1).payload.reply_markup.inline_keyboard.at(-1)[0].callback_data,"t:back-list");
  assert.equal((await handleWebhookRequest(webhook(callback(313,"t:back-list")),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/Page 2/);
  assert.equal((await handleWebhookRequest(webhook(callback(314,"t:home")),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.inline_keyboard[0][0].callback_data,"t:browse");
  assert.equal(calls.submit.length,0);
  assert.equal(calls.report.length,0);
  assert.equal(await env.BOT_STATE.get("rl:42"),null);
});

test("Worker lazily migrates old nine-key menus exactly once, without losing the action",async()=>{
  const env=makeEnv(),{deps,sent}=makeDeps();
  // Existing profile predates menuVersion and uses the old persistent keyboard.
  await env.BOT_STATE.put("profile:42",JSON.stringify({
    role:"seeker",language:"vi",languageManual:true,subscribed:true,
    watching:["DPNIHH"]
  }));
  const original=sent.length;
  assert.equal((await handleWebhookRequest(webhook(message(2801,"🎟 Nhận mã")),env,deps)).status,200);
  const changed=sent.slice(original);
  assert.equal(changed.filter(x=>x.payload?.reply_markup?.keyboard).length,1);
  assert.equal(changed.filter(x=>x.payload?.reply_markup?.inline_keyboard).length,1);
  const keys=changed.find(x=>x.payload?.reply_markup?.keyboard).payload.reply_markup.keyboard;
  assert.deepEqual(keys.map(x=>x.length),[3,2]);
  const profile=JSON.parse(await env.BOT_STATE.get("profile:42"));
  assert.match(profile.menuVersion,/^v1-[0-9a-f]{8}$/);
  assert.deepEqual(profile.watching,["DPNIHH"]);
  assert.equal(profile.subscribed,true);
  assert.equal((await handleWebhookRequest(webhook(message(2802,"🎟 Nhận mã")),env,deps)).status,200);
  assert.equal(sent.filter(x=>x.payload?.reply_markup?.keyboard).length,1);
  assert.equal((await handleWebhookRequest(webhook(message(2802,"🎟 Nhận mã")),env,deps)).status,200);
  assert.equal(sent.filter(x=>x.payload?.reply_markup?.keyboard).length,1);
});

test("Worker old menu Search refresh opens a visible new prompt, never an off-screen panel",async()=>{
  const env=makeEnv(),{deps,sent,calls}=makeDeps();
  deps.telegramApi=async(method,payload)=>{
    sent.push({name:method,payload});
    return method==="sendMessage"?{message_id:7000+sent.length}:undefined;
  };
  await env.BOT_STATE.put("profile:42",JSON.stringify({
    role:"seeker",language:"en",panelMessageId:120,
    watching:["DPNIHH"],subscribed:true
  }));
  assert.equal((await handleWebhookRequest(webhook(message(2830,"🔎 Search")),env,deps)).status,200);
  assert.equal(sent.filter(x=>x.name==="editMessageText").length,0,
    "Never edit the previous panel at message 120 above the current chat");
  const sentMessages=sent.filter(x=>x.name==="sendMessage");
  assert.equal(sentMessages.length,2,"One keyboard update and one visible Search prompt");
  assert.ok(sentMessages[0].payload.reply_markup.keyboard);
  assert.match(sentMessages[1].payload.text,/Enter a code or contributor name/);
  assert.equal(sentMessages[1].payload.reply_markup.inline_keyboard[0][0].callback_data,"t:home");
  const profile=JSON.parse(await env.BOT_STATE.get("profile:42"));
  assert.equal(profile.panelMessageId,7000+sent.length);
  assert.equal(profile.pending.type,"search");
  assert.deepEqual(profile.watching,["DPNIHH"]);
  assert.equal(profile.subscribed,true);
  assert.equal(calls.submit.length,0);
  assert.equal(calls.report.length,0);
  assert.equal((await handleWebhookRequest(webhook(message(2831,"DPNIHH")),env,deps)).status,200);
  assert.equal(sent.filter(x=>x.payload?.reply_markup?.keyboard).length,1);
  assert.equal(sent.findLast(x=>x.name==="editMessageText").payload.message_id,profile.panelMessageId,
    "Subsequent navigation can reuse the new nearby panel");
});

test("Worker /start, Settings Refresh menu and role changes send one keyboard each",async()=>{
  const env=makeEnv(),{deps,sent}=makeDeps();
  assert.equal((await handleWebhookRequest(webhook(message(2811,"/start")),env,deps)).status,200);
  assert.equal(sent.filter(x=>x.payload?.reply_markup?.keyboard).length,1);
  assert.equal((await handleWebhookRequest(webhook(message(2812,"/settings")),env,deps)).status,200);
  const settings=sent.findLast(x=>x.payload?.reply_markup?.inline_keyboard);
  assert.ok(settings.payload.reply_markup.inline_keyboard.some(row=>
    row.some(btn=>btn.callback_data==="t:menu:refresh")));
  const count=sent.filter(x=>x.payload?.reply_markup?.keyboard).length;
  assert.equal((await handleWebhookRequest(webhook(callback(2813,"t:menu:refresh")),env,deps)).status,200);
  assert.equal(sent.filter(x=>x.payload?.reply_markup?.keyboard).length,count+1);
  assert.equal((await handleWebhookRequest(webhook(message(2814,"/menu")),env,deps)).status,200);
  assert.equal(sent.filter(x=>x.payload?.reply_markup?.keyboard).length,count+2);
  assert.equal((await handleWebhookRequest(webhook(callback(2815,"t:role:seeker")),env,deps)).status,200);
  assert.equal(sent.filter(x=>x.payload?.reply_markup?.keyboard).length,count+3);
  const profile=JSON.parse(await env.BOT_STATE.get("profile:42"));
  assert.equal(profile.role,"seeker");
});

test("Worker failed automatic keyboard send keeps previous version and never replays the business action",async()=>{
  const env=makeEnv(),{deps,sent}=makeDeps();
  await env.BOT_STATE.put("profile:42",JSON.stringify({
    role:"seeker",language:"en",menuVersion:"v1-deadbeef",watching:["DPNIHH"]
  }));
  let fail=true;
  const original=deps.telegramApi;
  deps.telegramApi=async(method,payload)=>{
    if(method==="sendMessage"&&payload.reply_markup?.keyboard&&fail){
      fail=false;throw Error("Telegram unavailable");
    }
    return original(method,payload);
  };
  assert.equal((await handleWebhookRequest(webhook(message(2821,"🎟 Get codes")),env,deps)).status,200);
  assert.equal(await env.BOT_STATE.get("upd:2821"),"1");
  assert.equal(JSON.parse(await env.BOT_STATE.get("profile:42")).menuVersion,"v1-deadbeef");
  assert.equal(sent.filter(x=>x.payload?.reply_markup?.inline_keyboard).length,1);
  assert.equal((await handleWebhookRequest(webhook(message(2822,"🎟 Get codes")),env,deps)).status,200);
  assert.equal(sent.filter(x=>x.payload?.reply_markup?.keyboard).length,1);
  assert.notEqual(JSON.parse(await env.BOT_STATE.get("profile:42")).menuVersion,"v1-deadbeef");
});

test("worker status and privacy are read-only",async()=>{
  const env=makeEnv();
  const {deps,sent,calls}=makeDeps();
  assert.equal((await handleWebhookRequest(webhook(message(30,"/status DPNIHH")),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/23 \(as of 2026-11-15; not live\)/);
  assert.equal((await handleWebhookRequest(webhook(message(31,"/privacy")),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/PUBLIC GitHub Issue/);
  assert.equal(calls.submit.length,0);
  assert.equal(calls.report.length,0);
});

test("processing failures return 503 so Telegram can retry, without recording success", async () => {
  const env = makeEnv();
  let fail = true, attempts = 0;
  const { deps, sent } = makeDeps({
    submitNewCode: async () => {
      attempts++;
      if (fail) { fail = false; throw Error("Temporary upstream outage"); }
      return { kind: "submitted", url: "https://github.com/ePlus-DEV/muse-invite-hub/issues/90" };
    }
  });
  const update = callback(90, "t:submit:CODE12");
  assert.equal((await handleWebhookRequest(webhook(update), env, deps)).status, 503);
  assert.equal((await handleWebhookRequest(webhook(update), env, deps)).status, 200);
  assert.equal(attempts, 2);
  assert.match(sent.findLast(x=>x.name==="sendMessage").payload.text, /Submitted a public GitHub Issue/);
});

test("submit callback shows progress; two failures notify once and retries do not exhaust rate limits", async () => {
  const env=makeEnv();
  let attempts=0;
  const {deps,sent}=makeDeps({
    submitNewCode:async()=>{
      attempts++;
      if(attempts<=2)throw Error("Temporary GitHub failure");
      return {kind:"submitted",url:"https://github.com/ePlus-DEV/muse-invite-hub/issues/90"};
    }
  });
  const update=callback(240,"t:submit:CODE12");
  for(let i=0;i<2;i++){
    assert.equal((await handleWebhookRequest(webhook(update),env,deps)).status,503);
  }
  const answers=sent.filter(x=>x.name==="answerCallbackQuery");
  assert.match(answers[0].payload.text,/Sending your code/);
  const notices=sent.filter(x=>x.name==="sendMessage"&&
    x.payload.text.includes("Could not confirm the result for CODE12"));
  assert.equal(notices.length,1,"Retryable errors must not flood the chat");
  assert.equal(JSON.parse(await env.BOT_STATE.get("rl:42")).length,1,
    "Retrying the same update must not consume extra hourly write slots");
  assert.equal((await handleWebhookRequest(webhook(update),env,deps)).status,200);
  assert.equal(attempts,3);
  assert.equal(await env.BOT_STATE.get("upd:240"),"1");
  assert.match(sent.filter(x=>x.name==="sendMessage").at(-1).payload.text,/Submitted a public GitHub Issue/);
});

test("expired Telegram callback acknowledgement still submits to GitHub", async () => {
  const env=makeEnv();
  const {deps,sent,calls}=makeDeps();
  const sendApi=deps.telegramApi;
  deps.telegramApi=async(method,payload)=>{
    if(method==="answerCallbackQuery")throw Error("Telegram callback expired");
    return sendApi(method,payload);
  };
  assert.equal((await handleWebhookRequest(webhook(callback(241,"t:submit:CODE12")),env,deps)).status,200);
  assert.equal(calls.submit.length,1);
  assert.match(sent.find(x=>x.name==="sendMessage").payload.text,/Submitted a public GitHub Issue/);
});

test("feedback failures explain uncertain status without posting duplicate reports", async () => {
  const env=makeEnv();
  const {deps,sent}=makeDeps({submitFeedback:async()=>{throw Error("GitHub temporarily unavailable");}});
  const update=callback(242,"t:report:DPNIHH:worked");
  assert.equal((await handleWebhookRequest(webhook(update),env,deps)).status,503);
  assert.equal((await handleWebhookRequest(webhook(update),env,deps)).status,503);
  assert.equal(sent.filter(x=>x.name==="sendMessage"&&
    x.payload.text.includes("Could not confirm the feedback for DPNIHH")).length,1);
  assert.equal(await env.BOT_STATE.get("upd:242"),null);
});

test("per-chat write rate limit allows 8 reports per hour, then refuses", async () => {
  const env = makeEnv();
  const { deps, sent } = makeDeps();
  for (let i = 0; i < 8; i++) {
    assert.equal((await handleWebhookRequest(webhook(callback(100 + i, "t:report:REP00"+i+":worked")), env, deps)).status, 200);
  }
  assert.equal((await handleWebhookRequest(webhook(callback(200, "t:report:REP008:worked")), env, deps)).status, 200);
  assert.match(sent.findLast(x=>x.name==="sendMessage").payload.text, /Too many reports/);
});

test("a single Telegram chat can submit at most three new codes per 24 hours", async () => {
  const env=makeEnv();
  const {deps,calls,sent}=makeDeps();
  for(let i=0;i<3;i++){
    assert.equal((await handleWebhookRequest(
      webhook(callback(420+i,"t:submit:CODE1"+i)),env,deps)).status,200);
  }
  assert.equal(calls.submit.length,3);
  assert.equal((await handleWebhookRequest(webhook(callback(424,"t:submit:CODE14")),env,deps)).status,200);
  assert.equal(calls.submit.length,3);
  assert.match(sent.findLast(x=>x.name==="sendMessage").payload.text,/Too many submissions/);
  assert.equal(JSON.parse(await env.BOT_STATE.get("rl:42")).length,3);
});

test("same user cannot spam feedback on the same code more than once per day",async()=>{
  const env=makeEnv();
  const {deps,calls,sent}=makeDeps();
  assert.equal((await handleWebhookRequest(
    webhook(callback(500,"t:report:DPNIHH:worked")),env,deps)).status,200);
  assert.equal((await handleWebhookRequest(
    webhook(callback(501,"t:report:DPNIHH:failed")),env,deps)).status,200);
  assert.equal(calls.report.length,1);
  assert.match(sent.findLast(x=>x.name==="sendMessage").payload.text,/Too many reports/);
  assert.equal((await handleWebhookRequest(
    webhook(callback(502,"t:report:ANOTHR:worked")),env,deps)).status,200);
  assert.equal(calls.report.length,2);
});

test("global hourly budget limits mass submission across independent chats",async()=>{
  const env=makeEnv();
  const state=createKvState(env.BOT_STATE);
  for(let i=0;i<20;i++){
    assert.equal(await state.allowWrite(9000+i,1000+i,"submit","GLOB00"),true);
  }
  assert.equal(await state.allowWrite(9021,1021,"submit","GLOB01"),false);
  assert.equal(JSON.parse(await env.BOT_STATE.get("rl:global:submit")).length,20);
});

test("corrupt KV rate-limit state cannot silently reset anti-spam budget",async()=>{
  const env=makeEnv();
  await env.BOT_STATE.put("rl:42","{bad-json");
  const {deps,calls,sent}=makeDeps();
  assert.equal((await handleWebhookRequest(
    webhook(callback(425,"t:submit:CODE15")),env,deps)).status,200);
  assert.equal(calls.submit.length,0);
  assert.match(sent.findLast(x=>x.name==="sendMessage").payload.text,/Too many submissions/);
});

test("worker sources keep secrets out of the repository and reuse the review-only GitHub flow", () => {
  const worker = read("worker.mjs");
  const wrangler = read("wrangler.toml");
  assert.match(worker, /crypto\.subtle\.digest/);
  assert.match(worker, /BOT_STATE/);
  assert.match(worker, /MAX_BODY = 32 \* 1024/);
  assert.doesNotMatch(worker, /api\.telegram\.org\/bot\d+:/);
  assert.doesNotMatch(wrangler, /TELEGRAM_BOT_TOKEN\s*=\s*"/);
  assert.doesNotMatch(wrangler, /GITHUB_ISSUES_TOKEN\s*=\s*"/);
});

test("Cloudflare Worker defaults to English and preserves manually chosen languages",async()=>{
  const env=makeEnv();
  const {deps,sent}=makeDeps();
  const vi={...message(600,"/start")};
  vi.message.from.language_code="vi-VN";
  assert.equal((await handleWebhookRequest(webhook(vi),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/Welcome/);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 I need a code");
  assert.equal((await handleWebhookRequest(webhook(message(601,"/status DPNIHH")),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/published/);
  assert.equal((await handleWebhookRequest(webhook(callback(602,"t:lang:ja")),env,deps)).status,200);
  assert.equal(sent.findLast(x=>x.payload?.reply_markup?.keyboard).payload.reply_markup.keyboard[0][0],"🙋 コードが欲しい");
  const pref=JSON.parse(await env.BOT_STATE.get("profile:42"));
  assert.equal(pref.language,"ja");
  assert.equal(pref.languageManual,true);
  const viClient={...message(603,"/start")};
  viClient.message.from.language_code="vi";
  assert.equal((await handleWebhookRequest(webhook(viClient),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 コードが欲しい");
  assert.equal((await handleWebhookRequest(webhook(message(604,"/language en")),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 I need a code");
  assert.equal((await handleWebhookRequest(webhook(message(605,"/delete_data")),env,deps)).status,200);
  assert.equal((await handleWebhookRequest(webhook(callback(606,"t:erase:confirm")),env,deps)).status,200);
  const initial=JSON.parse(await env.BOT_STATE.get("profile:42")||"null");
  assert.equal(initial,null);
  const freshVietnameseClient={...message(607,"/start")};
  freshVietnameseClient.message.from.language_code="vi-VN";
  assert.equal((await handleWebhookRequest(webhook(freshVietnameseClient),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 I need a code",
    "Deleting preferences resets to English even if Telegram is Vietnamese");
});

test("Worker reply-keyboard Settings edits the saved inline panel in KV",async()=>{
  const env=makeEnv(),{deps,sent,calls}=makeDeps();
  deps.telegramApi=async(name,payload)=>{
    sent.push({name,payload});
    return name==="sendMessage"?{message_id:2000+sent.length}:undefined;
  };
  assert.equal((await handleWebhookRequest(webhook(message(860,"/language vi")),env,deps)).status,200);
  assert.equal((await handleWebhookRequest(webhook(message(861,"/start")),env,deps)).status,200);
  assert.equal((await handleWebhookRequest(webhook(message(862,"🙋 Tôi cần mã")),env,deps)).status,200);
  const panelId=2000+sent.length;
  assert.equal(JSON.parse(await env.BOT_STATE.get("profile:42")).panelMessageId,panelId);
  const messages=sent.filter(x=>x.name==="sendMessage").length;
  assert.equal((await handleWebhookRequest(webhook(message(863,"⚙️ Cài đặt")),env,deps)).status,200);
  assert.equal(sent.at(-1).name,"editMessageText");
  assert.equal(sent.at(-1).payload.message_id,panelId);
  assert.equal((await handleWebhookRequest(webhook(callback(864,"t:sub:on",panelId)),env,deps)).status,200);
  assert.equal(sent.at(-1).name,"editMessageText");
  assert.match(sent.at(-1).payload.text,/BẬT/);
  assert.equal((await handleWebhookRequest(webhook(callback(865,"t:watchlist",panelId)),env,deps)).status,200);
  assert.equal(sent.at(-1).name,"editMessageText");
  assert.equal((await handleWebhookRequest(webhook(message(866,"🎟 Nhận mã")),env,deps)).status,200);
  assert.equal(sent.at(-1).name,"editMessageText");
  assert.equal(sent.filter(x=>x.name==="sendMessage").length,messages);
  assert.equal(JSON.parse(await env.BOT_STATE.get("profile:42")).subscribed,true);
  assert.equal(calls.submit.length,0);
  assert.equal(calls.report.length,0);
});

test("Worker onboarding lets seekers request community codes and switch to contributing safely",async()=>{
  const env=makeEnv();
  const {deps,sent,calls}=makeDeps();
  // Vietnamese remains available, but only after the user explicitly selects it.
  assert.equal((await handleWebhookRequest(webhook(message(699,"/language vi")),env,deps)).status,200);
  const vi={...message(700,"/start")};
  vi.message.from.language_code="vi";
  assert.equal((await handleWebhookRequest(webhook(vi),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 Tôi cần mã");
  assert.equal((await handleWebhookRequest(webhook(callback(701,"t:role:seeker")),env,deps)).status,200);
  const keyboard=sent.findLast(x=>x.payload?.reply_markup?.keyboard).payload.reply_markup.keyboard.flat();
  assert.equal(keyboard.length,5);
  assert.ok(keyboard.includes("🎟 Nhận mã"));
  assert.ok(!keyboard.includes("🙋 Cần mã"));
  assert.match(sent.at(-1).payload.text,/Mã mời cộng đồng/);
  assert.match(sent.at(-1).payload.reply_markup.inline_keyboard[0][0].text,/Còn 23 lượt \(đã báo cáo\)/);
  assert.match(sent.at(-1).payload.reply_markup.inline_keyboard[1][0].text,/30\/30 \(mặc định\)/);
  assert.equal((await handleWebhookRequest(webhook(message(702,"🙋 Cần mã")),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.inline_keyboard.length,3);
  assert.equal(sent.at(-1).payload.reply_markup.inline_keyboard[2][2].callback_data,"t:home");
  assert.equal(JSON.parse(await env.BOT_STATE.get("profile:42")).subscribed,false);
  assert.equal(calls.submit.length,0);
  assert.equal((await handleWebhookRequest(webhook(callback(703,"t:need:alerts")),env,deps)).status,200);
  assert.equal(JSON.parse(await env.BOT_STATE.get("profile:42")).subscribed,true);
  assert.equal((await handleWebhookRequest(webhook(message(704,"🔄 Đổi vai trò")),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.inline_keyboard[1][0].callback_data,"t:role:contributor");
  assert.equal((await handleWebhookRequest(webhook(callback(705,"t:role:contributor")),env,deps)).status,200);
  const contributor=sent.at(-1).payload.reply_markup.keyboard.flat();
  assert.ok(contributor.includes("➕ Đóng góp"));
  assert.equal(contributor.length,5);
  assert.equal(JSON.parse(await env.BOT_STATE.get("profile:42")).role,"contributor");
  assert.equal((await handleWebhookRequest(webhook(message(706,"📍 Trạng thái mã")),env,deps)).status,200);
  assert.equal((await handleWebhookRequest(webhook(message(707,"DPNIHH")),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/đã được công bố/);
  assert.equal(calls.submit.length,0);
});
