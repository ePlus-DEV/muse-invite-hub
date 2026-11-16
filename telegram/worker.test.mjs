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
const message = (id, text) => ({ update_id: id, message: { text, from: { id: 42, is_bot: false }, chat: { id: 42, type: "private" } } });
const callback = (id, data) => ({ update_id: id, callback_query: { id: "cb-" + id, data, from: { id: 42 }, message: { message_id: id+100, chat: { id: 42, type: "private" } } } });

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
  assert.deepEqual(calls.submit[0], ["TEST42", 11, "issue-token-test"]);
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

test("per-chat write rate limit allows 8 writes per hour, then refuses", async () => {
  const env = makeEnv();
  const { deps, sent } = makeDeps();
  for (let i = 0; i < 8; i++) {
    assert.equal((await handleWebhookRequest(webhook(callback(100 + i, "t:submit:CODE12")), env, deps)).status, 200);
  }
  assert.equal((await handleWebhookRequest(webhook(callback(200, "t:submit:CODE12")), env, deps)).status, 200);
  assert.match(sent.findLast(x=>x.name==="sendMessage").payload.text, /Too many submissions/);
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

test("Cloudflare Worker selects language from Telegram and honors manual override",async()=>{
  const env=makeEnv();
  const {deps,sent}=makeDeps();
  const vi={...message(600,"/start")};
  vi.message.from.language_code="vi-VN";
  assert.equal((await handleWebhookRequest(webhook(vi),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/Chào mừng/);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 Tôi cần mã");
  assert.equal((await handleWebhookRequest(webhook(message(601,"/status DPNIHH")),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/đã được công bố/);
  assert.equal((await handleWebhookRequest(webhook(callback(602,"t:lang:ja")),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 コードが欲しい");
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
});

test("Worker onboarding lets seekers request community codes and switch to contributing safely",async()=>{
  const env=makeEnv();
  const {deps,sent,calls}=makeDeps();
  const vi={...message(700,"/start")};
  vi.message.from.language_code="vi";
  assert.equal((await handleWebhookRequest(webhook(vi),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard[0][0],"🙋 Tôi cần mã");
  assert.equal((await handleWebhookRequest(webhook(callback(701,"t:role:seeker")),env,deps)).status,200);
  assert.ok(sent.at(-1).payload.reply_markup.keyboard.flat().includes("🙋 Cần mã"));
  assert.equal((await handleWebhookRequest(webhook(message(702,"🙋 Cần mã")),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.inline_keyboard.length,3);
  assert.equal(JSON.parse(await env.BOT_STATE.get("profile:42")).subscribed,false);
  assert.equal(calls.submit.length,0);
  assert.equal((await handleWebhookRequest(webhook(callback(703,"t:need:alerts")),env,deps)).status,200);
  assert.equal(JSON.parse(await env.BOT_STATE.get("profile:42")).subscribed,true);
  assert.equal((await handleWebhookRequest(webhook(message(704,"🔄 Đổi vai trò")),env,deps)).status,200);
  assert.equal(sent.at(-1).payload.reply_markup.keyboard[1][0],"🤝 Tôi muốn chia sẻ mã");
  assert.equal((await handleWebhookRequest(webhook(callback(705,"t:role:contributor")),env,deps)).status,200);
  assert.ok(sent.at(-1).payload.reply_markup.keyboard.flat().includes("➕ Đóng góp"));
  assert.equal(JSON.parse(await env.BOT_STATE.get("profile:42")).role,"contributor");
  assert.equal((await handleWebhookRequest(webhook(message(706,"📍 Trạng thái mã")),env,deps)).status,200);
  assert.equal((await handleWebhookRequest(webhook(message(707,"DPNIHH")),env,deps)).status,200);
  assert.match(sent.at(-1).payload.text,/đã được công bố/);
  assert.equal(calls.submit.length,0);
});
