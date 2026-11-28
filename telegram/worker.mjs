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
import { parseUpdate, keyboard, MAX_UPDATE_ATTEMPTS } from "./bot.mjs";
import { replyKeyboard } from "./menu.mjs";
import { createMenuSync } from "./menu-sync.mjs";
import { handleLegacy } from "./legacy.mjs";
import { resolveInput, handleInteractive } from "./conversation.mjs";
import { makeKvProfiles, syncTelegramLocale } from "./profiles.mjs";
import { tr } from "./i18n.mjs";
import { listRecentCodes, submitNewCode, submitFeedback, getCodeStatus, browseCodes } from "./github.mjs";
import { writeDecision, WRITE_DAY_MS } from "./write-limit.mjs";

const SITE = "https://muse.eplus.dev";
const MAX_BODY = 32 * 1024;
const DEDUP_TTL_SECONDS = 7 * 24 * 3600;
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
    async noteFailure(updateId) {
      const raw = await kv.get("fail-count:" + updateId);
      const parsed = Number.parseInt(raw ?? "", 10);
      const next = (Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0) + 1;
      await kv.put("fail-count:" + updateId, String(next), { expirationTtl: DEDUP_TTL_SECONDS });
      return next;
    },
    async wasFailureNotified(updateId) {
      return (await kv.get("fail-notice:" + updateId)) !== null;
    },
    async markFailureNotified(updateId) {
      await kv.put("fail-notice:" + updateId, "1", { expirationTtl: DEDUP_TTL_SECONDS });
    },
    async allowWrite(chatId, updateId, kind, code) {
      // A retry must not consume a second slot, even after an upstream 503.
      const writeKey = Number.isSafeInteger(updateId) ? "write-attempt:" + updateId : null;
      if (writeKey && (await kv.get(writeKey)) !== null) return true;
      const key = "rl:" + chatId;
      const now = Date.now();
      // Fail closed if private rate-limit state is malformed or temporarily
      // unreadable; treating KV errors as an empty budget enables spam.
      let personal;
      try {
        const raw=await kv.get(key);
        personal=writeDecision(raw===null?null:JSON.parse(raw),
          {kind,updateId,code,now,scope:"chat"});
      } catch {
        return false;
      }
      if(!personal.allowed)return false;
      let global=null;
      if(kind==="submit"){
        try{
          const raw=await kv.get("rl:global:submit");
          global=writeDecision(raw===null?null:JSON.parse(raw),
            {kind,updateId,now,scope:"global"});
        }catch{
          return false;
        }
        if(!global.allowed)return false;
      }
      const ttl=WRITE_DAY_MS/1000;
      // Telegram webhook registration requests max_connections=1. KV is
      // eventually consistent (not a transaction); global cap is best-effort.
      if(global)await kv.put("rl:global:submit",JSON.stringify(global.history),{expirationTtl:ttl});
      await kv.put(key,JSON.stringify(personal.history),{expirationTtl:ttl});
      if(writeKey)await kv.put(writeKey,"1",{expirationTtl:DEDUP_TTL_SECONDS});
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
    const result=await response.json().catch(()=>null);
    if(!response.ok||result?.ok!==true){
      throw Error("Telegram "+method+" HTTP "+response.status+": "+
        String(result?.description||"Unknown API error").slice(0,160));
    }
    return result.result;
  });
  async function send(chat_id, text, buttons) {
    const payload = { chat_id, text, disable_web_page_preview: true };
    if (buttons) payload.reply_markup = keyboard(buttons);
    return call("sendMessage", payload);
  }
  async function edit(chatId,messageId,text,buttons) {
    return call("editMessageText",{
      chat_id:chatId,message_id:messageId,text,disable_web_page_preview:true,
      reply_markup:keyboard(buttons||[])
    });
  }
  async function sendMenu(chatId,text,language="en",role="legacy") {
    return call("sendMessage",{
      chat_id:chatId,text,disable_web_page_preview:true,reply_markup:replyKeyboard(language,role)
    });
  }
  async function removeMessage(chatId,messageId) {
    return call("deleteMessage",{chat_id:chatId,message_id:messageId});
  }
  return async function handle(update, state, profiles) {
    let action = parseUpdate(update);
    if (!action) return;
    const chatId=action.chatId;
    try {
      if(action.type!=="private-only")
        await syncTelegramLocale(profiles,chatId,action.telegramLanguage);
      const refreshCallback=Boolean(action.callbackId &&
        ["refresh","refresh-code"].includes(action.type));
      // Reply immediately for non-refresh callbacks. Refresh replies after
      // the edit, allowing an "Already up to date" toast without a new card.
      if(action.callbackId&&!refreshCallback){
        const language=(await profiles.get(chatId)).language||"en";
        const key=action.type==="submit"?"submitProcessing":
          action.type==="report"?"reportProcessing":null;
        try {
          await call("answerCallbackQuery",{
            callback_query_id:action.callbackId,
            ...(key?{text:tr(language,key)}:{})
          });
        } catch { /* Expired callbacks must not block other work. */ }
      }
      const acknowledge=async text=>call("answerCallbackQuery",{
        callback_query_id:action.callbackId,...(text?{text}:{})
      });
      action=await resolveInput(action,profiles);
      const menuSync=createMenuSync({profiles,sendMenu,removeMessage,action});
      // Silent menu-version bookkeeping only: this never sends a message,
      // so the response to the user's action remains the only new item.
      await menuSync.syncIfNeeded(chatId);
      if(await handleInteractive({action,profiles,send,
        sendMenu:menuSync.trackedSendMenu,edit,removeMessage,
        acknowledge,services,githubToken})) return;
      async function complete(message) {
        await send(chatId,message);
        if(action.callbackId&&action.messageId) {
          try { await call("editMessageReplyMarkup",{
            chat_id:chatId,message_id:action.messageId,reply_markup:{inline_keyboard:[]}
          }); } catch { /* UI cleanup failure must not repost GitHub feedback. */ }
        }
      }
      const result=await handleLegacy({
        action,profiles,send,complete,services,githubToken,
        allowWrite:(id,code)=>state.allowWrite(id,action.updateId,action.type,code)
      });
      return result;
    } catch(error) {
      if(action.callbackId&&["submit","report"].includes(action.type)) {
        try {
          // A failure may happen AFTER GitHub accepted a write; never claim it failed.
          // Keep the webhook retryable, but send at most one notice per update ID.
          if(!(await state.wasFailureNotified(action.updateId))) {
            const language=(await profiles.get(chatId)).language||"en";
            await send(chatId,tr(language,
              action.type==="submit"?"submitUncertain":"reportUncertain",{code:action.code}));
            await state.markFailureNotified(action.updateId);
          }
        } catch { /* Preserve the original exception for Telegram's automatic retry. */ }
      }
      throw error;
    }
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
    const notifyCall=async(method,payload)=>{
      const response=await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/"+method,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok||data?.ok!==true)
        throw Object.assign(Error("Telegram notification "+method+" failed: "+
          String(data?.description||"Unknown API error").slice(0,110)),{status:data?.error_code||response.status});
      return data.result;
    };
    return notificationResponse(request,{
      secret:env.TELEGRAM_NOTIFY_SECRET,
      state:makeWorkerNotifyState(env.BOT_STATE),
      catalog:async()=> (await import("./github.mjs")).publishedCatalog(),
      send:(chatId,text)=>notifyCall("sendMessage",{
        chat_id:chatId,text,disable_web_page_preview:true
      }),
      edit:(chatId,messageId,text)=>notifyCall("editMessageText",{
        chat_id:chatId,message_id:messageId,text,disable_web_page_preview:true
      }),
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
    // Do not acknowledge failed updates at first; Telegram will retry.
    // Never log message content, account identifiers, tokens or full
    // upstream URLs. But retries are bounded: after MAX_UPDATE_ATTEMPTS
    // consecutive failures the update is acknowledged and dropped, so a
    // single poison update cannot jam the queue for everyone. Write
    // actions have already sent their one "uncertain" notice by then.
    console.error("Telegram update processing failed:", String(error.message).slice(0, 130));
    let attempts = 0;
    try {
      attempts = await state.noteFailure(update.update_id);
    } catch { /* State store unreachable: keep asking Telegram to retry. */ }
    if (attempts >= MAX_UPDATE_ATTEMPTS) {
      try { await state.add(update.update_id); } catch { /* Best effort. */ }
      console.error("Telegram update dropped after repeated failures");
      return respond(200, "dropped");
    }
    return respond(503, "retry");
  }
}

export default {
  fetch(request, env) {
    return handleWebhookRequest(request, env);
  }
};
