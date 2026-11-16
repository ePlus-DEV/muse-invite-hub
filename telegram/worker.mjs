/* Cloudflare Workers entry for the Telegram bot.
 *
 * Same behavior and messages as server.mjs (the OCI/Node runtime); only the
 * transport and durable state differ:
 * - Webhook secret is compared in constant time over SHA-256 digests.
 * - Update-ID deduplication and the per-chat write rate limit live in the
 *   BOT_STATE KV namespace instead of an on-disk file, so dedup stays durable
 *   across Worker instances and restarts (see AGENTS.md).
 * - github.mjs keeps its own idempotency markers as a second layer.
 * Secrets arrive only as Worker secrets (env), never from repository files.
 */
import { parseUpdate, keyboard } from "./bot.mjs";
import { replyKeyboard } from "./menu.mjs";
import { handleLegacy } from "./legacy.mjs";
import { resolveInput, handleInteractive } from "./conversation.mjs";
import { makeKvProfiles, syncTelegramLocale } from "./profiles.mjs";
import { listRecentCodes, submitNewCode, submitFeedback, getCodeStatus, browseCodes } from "./github.mjs";

const SITE = "https://muse.eplus.dev";
const MAX_BODY = 32 * 1024;
const DEDUP_TTL_SECONDS = 7 * 24 * 3600;
const RATE_WINDOW_MS = 3600000;
const RATE_MAX_WRITES = 8;

async function constantTimeEqual(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const encoder = new TextEncoder();
  const [one, two] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const a = new Uint8Array(one), b = new Uint8Array(two);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function createKvState(kv) {
  return {
    async has(updateId) {
      return (await kv.get("upd:" + updateId)) !== null;
    },
    async add(updateId) {
      await kv.put("upd:" + updateId, "1", { expirationTtl: DEDUP_TTL_SECONDS });
    },
    async allowWrite(chatId) {
      const key = "rl:" + chatId;
      const now = Date.now();
      let recent = [];
      try {
        const raw = await kv.get(key);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) recent = parsed.filter(v => Number.isFinite(v) && now - v < RATE_WINDOW_MS);
      } catch { recent = []; }
      if (recent.length >= RATE_MAX_WRITES) return false;
      recent.push(now);
      await kv.put(key, JSON.stringify(recent), { expirationTtl: RATE_WINDOW_MS / 1000 });
      return true;
    }
  };
}

export function createBotHandler({ token, githubToken, telegramApi, services = { listRecentCodes, submitNewCode, submitFeedback, getCodeStatus, browseCodes } }) {
  const call = telegramApi || (async (method, payload) => {
    const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw Error("Telegram API HTTP " + response.status);
    const result = await response.json();
    if (result.ok !== true) throw Error("Telegram rejected " + method);
  });
  async function send(chat_id, text, buttons) {
    const payload = { chat_id, text, disable_web_page_preview: true };
    if (buttons) payload.reply_markup = keyboard(buttons);
    return call("sendMessage", payload);
  }
  async function sendMenu(chatId,text,language="en",role="legacy") {
    return call("sendMessage",{
      chat_id:chatId,text,disable_web_page_preview:true,reply_markup:replyKeyboard(language,role)
    });
  }
  return async function handle(update, state, profiles) {
    let action = parseUpdate(update);
    if (!action) return;
    const chatId=action.chatId;
    if (action.callbackId) {
      await call("answerCallbackQuery", { callback_query_id: action.callbackId });
    }
    if(action.type!=="private-only")
      await syncTelegramLocale(profiles,chatId,action.telegramLanguage);
    action=await resolveInput(action,profiles);
    if(await handleInteractive({action,profiles,send,sendMenu,services,githubToken}))return;
    async function complete(message) {
      await send(chatId,message);
      if(action.callbackId&&action.messageId) {
        try { await call("editMessageReplyMarkup",{
          chat_id:chatId,message_id:action.messageId,reply_markup:{inline_keyboard:[]}
        }); } catch { /* UI cleanup failure must not repost GitHub feedback. */ }
      }
    }
    return handleLegacy({
      action,profiles,send,complete,services,githubToken,
      allowWrite:id=>state.allowWrite(id)
    });
  };
}

function respond(status, body, contentType) {
  return new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(contentType ? { "Content-Type": contentType } : {})
    }
  });
}

export async function handleWebhookRequest(request, env, deps = {}) {
  const url = new URL(request.url);
  if (url.pathname === "/healthz" && request.method === "GET") {
    return respond(200, '{"status":"ok"}', "application/json");
  }
  if (url.pathname === "/version" && request.method === "GET") {
    const revision = /^[a-f0-9]{40}$/.test(env?.BUILD_SHA || "") ? env.BUILD_SHA : "unknown";
    return respond(200, JSON.stringify({revision}), "application/json");
  }
  if(url.pathname==="/telegram/notify"&&request.method==="POST"){
    const {notificationResponse}=await import("./notifications.mjs");
    const {makeWorkerNotifyState}=await import("./notify-worker.mjs");
    if(!env.BOT_STATE||!env.TELEGRAM_BOT_TOKEN)return respond(503,"notifications not configured");
    return notificationResponse(request,{
      secret:env.TELEGRAM_NOTIFY_SECRET,
      state:makeWorkerNotifyState(env.BOT_STATE),
      catalog:async()=> (await import("./github.mjs")).publishedCatalog(),
      send:async(chatId,text)=>{
        const result=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true}),
          signal:AbortSignal.timeout(10000)
        });
        if(!result.ok||(await result.json()).ok!==true)throw Error("Telegram notify send failed");
      },
      logger:msg=>console.error(msg)
    });
  }
  if (url.pathname !== "/telegram/webhook" || request.method !== "POST") {
    return respond(404, "");
  }
  const token = env.TELEGRAM_BOT_TOKEN;
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  const githubToken = env.GITHUB_ISSUES_TOKEN;
  if (typeof token !== "string" || token.length < 20 ||
      !/^[A-Za-z0-9_-]{16,256}$/.test(secret || "") || !githubToken || !env.BOT_STATE) {
    console.error("Telegram worker is not fully configured");
    return respond(500, "");
  }
  if (!(await constantTimeEqual(request.headers.get("x-telegram-bot-api-secret-token"), secret))) {
    return respond(403, "");
  }
  if (!String(request.headers.get("content-type") || "").startsWith("application/json")) {
    return respond(415, "");
  }
  let update;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return respond(413, "");
    update = JSON.parse(text);
    if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) throw Error("Invalid update_id");
  } catch {
    return respond(400, "");
  }
  const state = createKvState(env.BOT_STATE);
  const profiles=makeKvProfiles(env.BOT_STATE);
  const handle = createBotHandler({ token, githubToken, telegramApi: deps.telegramApi, services: deps.services });
  try {
    if (await state.has(update.update_id)) return respond(200, "ok");
    await handle(update, state, profiles);
    await state.add(update.update_id);
    return respond(200, "ok");
  } catch (error) {
    // Do not acknowledge failed updates; Telegram will retry. Never log
    // message content, account identifiers, tokens or full upstream URLs.
    console.error("Telegram update processing failed:", String(error.message).slice(0, 130));
    return respond(503, "retry");
  }
}

export default {
  fetch(request, env) {
    return handleWebhookRequest(request, env);
  }
};
