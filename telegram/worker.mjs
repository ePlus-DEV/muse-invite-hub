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
import { parseUpdate, keyboard, formatCodeStatus } from "./bot.mjs";
import { REPLY_KEYBOARD } from "./menu.mjs";
import { resolveInput, handleInteractive } from "./conversation.mjs";
import { makeKvProfiles, mutateProfile } from "./profiles.mjs";
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
  async function sendMenu(chatId,text) {
    return call("sendMessage",{
      chat_id:chatId,text,disable_web_page_preview:true,reply_markup:REPLY_KEYBOARD
    });
  }
  return async function handle(update, state, profiles) {
    let action = parseUpdate(update);
    if (!action) return;
    const chatId=action.chatId;
    if (action.callbackId) {
      await call("answerCallbackQuery", { callback_query_id: action.callbackId });
    }
    action=await resolveInput(action,profiles);
    if(await handleInteractive({action,profiles,send,sendMenu,services,githubToken}))return;
    const {type,code,result,updateId}=action;
    async function complete(message) {
      await send(chatId,message);
      if(action.callbackId&&action.messageId) {
        try { await call("editMessageReplyMarkup",{
          chat_id:chatId,message_id:action.messageId,reply_markup:{inline_keyboard:[]}
        }); } catch { /* UI cleanup failure must not repost GitHub feedback. */ }
      }
    }
    switch (type) {
      case "private-only":
        return send(chatId, "Please open this bot in a private chat to protect your reports.");
      case "help":
        return send(chatId, [
          "✦ Muse Invite Hub — community invite directory",
          "",
          "/codes — browse recent public invite codes",
          "/status CODE — published status or pending review",
          "/submit CODE — suggest a new public invite code",
          "/report CODE worked — report a successful try",
          "/report CODE failed — report an unsuccessful try",
          "/count CODE — owner-only count update guidance",
          "/privacy — what becomes public",
          "/cancel — cancel an action",
          "",
          "Reports require confirmation and are reviewed on GitHub.",
          "Never share passwords, one-time login codes or private links."
        ].join("\n"), [[{ text: "Browse all codes", url: SITE + "/#codes" }]]);
      case "codes": {
        const latest = await services.listRecentCodes();
        return send(chatId, latest.length
          ? "Recent published codes (not guaranteed to work):\n\n" +
            latest.map(x => "• " + x).join("\n")
          : "No published codes found. Please check the website.", [
            [{ text: "Browse and copy codes", url: SITE + "/#codes" }]
          ]);
      }
      case "status": {
        const entry=await services.getCodeStatus(code,githubToken);
        return send(chatId,formatCodeStatus(code,entry),[[{text:"Browse directory",url:SITE+"/#codes"}]]);
      }
      case "usage-code":
        return send(chatId,"Use /get CODE, /watch CODE or /unwatch CODE (exactly 6 letters/digits).");
      case "usage-status":
        return send(chatId,"Use /status CODE with exactly 6 letters or digits, e.g. /status DPNIHH.");
      case "privacy":
        return send(chatId,"Only send public Muse invite codes and genuine redemption feedback. "+
          "After confirmation, a PUBLIC GitHub Issue/comment contains the code and report, "+
          "but not your Telegram username or account ID. Moderators review all Telegram submissions. "+
          "Do not send passwords, one-time codes, private links or personal data. "+
          "Your Telegram identity does not prove code ownership.");
      case "count":
        return send(chatId, "Owner-only quota changes require a verified GitHub account. " +
          "Telegram identity is not proof of ownership. Open your listing and choose Update count.",
          [[{ text: "Open directory", url: SITE + "/#codes" }]]);
      case "usage-submit":
        return send(chatId, "Use /submit CODE with exactly 6 letters or digits, for example /submit DPNIHH. " +
          "Only share a public invite, not private credentials.");
      case "usage-report":
        return send(chatId, "Use /report CODE worked or /report CODE failed. " +
          "This is a community report, not Muse verification.");
      case "confirm-submit":
        return send(chatId, "Share public invite code " + code + "?\n" +
          "This will create a PUBLIC GitHub Issue for maintainer review. " +
          "No Telegram username or account ID is published. This does not verify ownership or redeem the code.", [
          [{ text: "Confirm public submission", data: "t:submit:" + code }],
          [{ text: "Cancel", data: "t:cancel" }]
        ]);
      case "confirm-report":
        return send(chatId, "Report " + code + " as " + result + "?\n" +
          "This posts an anonymous PUBLIC comment to the code's existing GitHub Issue. " +
          "A maintainer will review it; status is not automatically changed.", [
          [{ text: "Confirm public report", data: "t:report:" + code + ":" + result }],
          [{ text: "Cancel", data: "t:cancel" }]
        ]);
      case "cancel": return complete("Cancelled. No information was submitted.");
      case "submit": {
        if (!(await state.allowWrite(chatId))) return complete("Too many submissions. Try again later.");
        const outcome = await services.submitNewCode(code, updateId, githubToken);
        if(outcome.kind==="submitted"&&
            /^https:\/\/github\.com\/ePlus-DEV\/muse-invite-hub\/issues\/[1-9]\d*$/.test(outcome.url||"")){
          await mutateProfile(profiles,chatId,p=>{
            if(!p.submitted.some(x=>x.code===code))p.submitted.push({code,url:outcome.url});
            p.submitted=p.submitted.slice(-50);return p;
          });
        }
        const message = {
          listed: "This code is already in the published directory.",
          pending: "A Telegram contribution Issue already exists; no duplicate was created.",
          submitted: "Submitted a public GitHub Issue for human review. This does not publish or verify the code."
        }[outcome.kind] || "Please review this code's status.";
        return complete(message + "\n" + outcome.url);
      }
      case "report": {
        if (!(await state.allowWrite(chatId))) return complete("Too many reports. Try again later.");
        const outcome = await services.submitFeedback(code, result, updateId, githubToken);
        const message = {
          unknown: "This code is not currently in the published catalog.",
          unmapped: "A canonical GitHub Issue is not yet available; use the website to report.",
          "already-reported": "This Telegram report was already received; no duplicate was posted.",
          reported: "Added feedback to the code's existing GitHub Issue for human review. No Muse status changed."
        }[outcome.kind] || "Please review this code's status.";
        return complete(message + "\n" + outcome.url);
      }
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
