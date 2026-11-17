import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { parseUpdate, keyboard } from "./bot.mjs";
import { replyKeyboard } from "./menu.mjs";
import { handleLegacy } from "./legacy.mjs";
import { resolveInput, handleInteractive } from "./conversation.mjs";
import { cleanProfile, syncTelegramLocale } from "./profiles.mjs";
import { tr } from "./i18n.mjs";
import { listRecentCodes, submitNewCode, submitFeedback, getCodeStatus, browseCodes } from "./github.mjs";
import { recentWriteEvents, writeDecision } from "./write-limit.mjs";

const SITE="https://muse.eplus.dev";
const MAX_BODY=32*1024;
function fileProfiles(dataDir) {
  const filename=join(dataDir,"private-profiles.json");
  const profiles=existsSync(filename)?JSON.parse(readFileSync(filename,"utf8")):{};
  if(!profiles||typeof profiles!=="object"||Array.isArray(profiles))throw Error("Corrupt private Telegram profiles");
  function save() {
    const tmp=filename+".tmp";
    writeFileSync(tmp,JSON.stringify(profiles),{mode:0o600});
    renameSync(tmp,filename);
  }
  return {
    async get(id){return cleanProfile(profiles[String(id)]);},
    async set(id,value){profiles[String(id)]=cleanProfile(value);save();},
    async delete(id){delete profiles[String(id)];save();}
  };
}

function constantTimeEqual(actual,expected) {
  if(typeof actual!=="string"||typeof expected!=="string")return false;
  const one=Buffer.from(actual),two=Buffer.from(expected);
  return one.length===two.length&&timingSafeEqual(one,two);
}
export function createTelegramApp({
  token,secret,githubToken,dataDir="/data",
  telegramApi,services={listRecentCodes,submitNewCode,submitFeedback,getCodeStatus,browseCodes}
}) {
  if(typeof token!=="string"||token.length<20||
    !/^[A-Za-z0-9_-]{16,256}$/.test(secret||"")||
    !githubToken)throw Error("Telegram token, webhook secret and GitHub Issues credentials are required");
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  const statePath=join(dataDir,"processed-updates.json");
  let processed=[];
  if(existsSync(statePath)){
    const disk=JSON.parse(readFileSync(statePath,"utf8"));
    if(!Array.isArray(disk)||disk.some(x=>!Number.isSafeInteger(x)||x<0))throw Error("Corrupt Telegram deduplication state");
    processed=disk.slice(-1000);
  }
  const handled=new Set(processed);
  const profiles=fileProfiles(dataDir);
  // Abuse budgets live in a separate private file so /delete_data cannot
  // reset spam protection; only non-public numeric chat/update IDs are stored.
  const limitPath=join(dataDir,"write-limits.json");
  let writeLimits=Object.create(null);
  if(existsSync(limitPath)){
    const parsed=JSON.parse(readFileSync(limitPath,"utf8"));
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
      throw Error("Corrupt Telegram anti-spam state");
    for(const [id,history] of Object.entries(parsed)){
      if(id!=="_global_submit"&&!/^[1-9][0-9]*$/.test(id))
        throw Error("Corrupt Telegram anti-spam state key");
      writeLimits[id]=recentWriteEvents(history);
    }
  }
  const notifiedFailures=new Set();
  let queue=Promise.resolve();
  const call=telegramApi || (async (method,payload)=>{
    const response=await fetch("https://api.telegram.org/bot"+token+"/"+method,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw Error("Telegram API HTTP "+response.status);
    const result=await response.json();
    if(result.ok!==true)throw Error("Telegram rejected "+method);
  });
  async function send(chat_id,text,buttons){
    const payload={chat_id,text,disable_web_page_preview:true};
    if(buttons)payload.reply_markup=keyboard(buttons);
    return call("sendMessage",payload);
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
  function allowWrite(chatId,updateId,kind,code) {
    const now=Date.now();
    const key=String(chatId);
    const personal=writeDecision(writeLimits[key]||[],{kind,updateId,code,now,scope:"chat"});
    if(!personal.allowed)return false;
    if(personal.retry)return true;
    let global=null;
    if(kind==="submit"){
      global=writeDecision(writeLimits._global_submit||[],
        {kind,updateId,now,scope:"global"});
      if(!global.allowed)return false;
    }
    writeLimits[key]=personal.history;
    if(global)writeLimits._global_submit=global.history;
    // Keep only active, recent chat budgets to bound private disk usage.
    for(const [id,records] of Object.entries(writeLimits)){
      const fresh=recentWriteEvents(records,now);
      if(!fresh.length)delete writeLimits[id];
      else writeLimits[id]=fresh;
    }
    const temp=limitPath+".tmp";
    writeFileSync(temp,JSON.stringify(writeLimits),{mode:0o600});
    renameSync(temp,limitPath);
    return true;
  }

  async function handle(update){
    let action=parseUpdate(update);
    if(!action)return;
    const chatId=action.chatId;
    try {
      if(action.type!=="private-only")
        await syncTelegramLocale(profiles,chatId,action.telegramLanguage);
      if(action.callbackId){
        const language=(await profiles.get(chatId)).language||"en";
        const key=action.type==="submit"?"submitProcessing":
          action.type==="report"?"reportProcessing":null;
        try {
          await call("answerCallbackQuery",{
            callback_query_id:action.callbackId,
            ...(key?{text:tr(language,key)}:{})
          });
        } catch { /* Expired callback answers should not block a GitHub write. */ }
      }
      action=await resolveInput(action,profiles);
      if(await handleInteractive({action,profiles,send,sendMenu,edit,services,githubToken}))return;
      async function complete(message) {
        await send(chatId,message);
        if(action.callbackId&&action.messageId) {
          // Best-effort UI cleanup. GitHub idempotency prevents duplicate writes.
          try { await call("editMessageReplyMarkup",{
            chat_id:chatId,message_id:action.messageId,reply_markup:{inline_keyboard:[]}
          }); } catch { /* UI error must never retry a successful GitHub write. */ }
        }
      }
      return await handleLegacy({
        action,profiles,send,complete,services,githubToken,
        allowWrite:async (id,code)=>allowWrite(id,action.updateId,action.type,code)
      });
    } catch(error) {
      if(action.callbackId&&["submit","report"].includes(action.type)&&
          !notifiedFailures.has(action.updateId)) {
        try {
          const language=(await profiles.get(chatId)).language||"en";
          await send(chatId,tr(language,
            action.type==="submit"?"submitUncertain":"reportUncertain",{code:action.code}));
          notifiedFailures.add(action.updateId);
          if(notifiedFailures.size>1000)
            notifiedFailures.delete(notifiedFailures.values().next().value);
        } catch { /* Preserve the original failure for Telegram retries. */ }
      }
      throw error;
    }
  }

  function mark(updateId){
    if(handled.has(updateId))return;
    processed.push(updateId);
    processed=processed.slice(-1000);
    handled.clear();
    for(const id of processed)handled.add(id);
    const temporary=statePath+".tmp";
    writeFileSync(temporary,JSON.stringify(processed),{mode:0o600});
    renameSync(temporary,statePath);
  }
  const server=createServer(async(req,res)=>{
    res.setHeader("Cache-Control","no-store");
    res.setHeader("X-Content-Type-Options","nosniff");
    if(req.url==="/healthz"&&req.method==="GET"){
      res.writeHead(200,{"Content-Type":"application/json"});
      return res.end('{"status":"ok"}');
    }
    if(req.url==="/telegram/notify"&&req.method==="POST"){
      const notifySecret=process.env.TELEGRAM_NOTIFY_SECRET;
      if(!notifySecret){res.writeHead(503);return res.end("notifications not configured");}
      let body;
      try{
        const chunks=[];let bytes=0;
        for await(const chunk of req){
          bytes+=chunk.length;
          if(bytes>4096){res.writeHead(413);return res.end();}
          chunks.push(chunk);
        }
        body=Buffer.concat(chunks).toString("utf8");
      }catch{res.writeHead(400);return res.end();}
      const {notificationResponse}=await import("./notifications.mjs");
      const {makeNodeNotifyState}=await import("./notify-oci.mjs");
      const notifyState=makeNodeNotifyState(dataDir);
      const request=new Request("https://telegram.internal/telegram/notify",{
        method:"POST",headers:req.headers,body
      });
      const response=await notificationResponse(request,{
        secret:notifySecret,state:notifyState,
        catalog:async()=> (await import("./github.mjs")).publishedCatalog(),
        send:(chatId,text)=>call("sendMessage",{chat_id:chatId,text,disable_web_page_preview:true}),
        logger:msg=>console.error(msg)
      });
      res.writeHead(response.status,{"Content-Type":response.headers.get("content-type")||"text/plain","Cache-Control":"no-store"});
      return res.end(await response.text());
    }
    if(req.url!=="/telegram/webhook"||req.method!=="POST"){
      res.writeHead(404);return res.end();
    }
    if(!constantTimeEqual(req.headers["x-telegram-bot-api-secret-token"],secret)){
      res.writeHead(403);return res.end();
    }
    if(!String(req.headers["content-type"]||"").startsWith("application/json")){
      res.writeHead(415);return res.end();
    }
    let update;
    try{
      const chunks=[];let bytes=0;
      for await(const chunk of req) {
        bytes+=chunk.length;
        if(bytes>MAX_BODY){res.writeHead(413);return res.end();}
        chunks.push(chunk);
      }
      update=JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if(!Number.isSafeInteger(update?.update_id)||update.update_id<0)throw Error("Invalid update_id");
    }catch{
      res.writeHead(400);return res.end();
    }
    const processing=queue.catch(()=>{}).then(async()=>{
      if(handled.has(update.update_id))return;
      await handle(update);
      mark(update.update_id);
    });
    queue=processing;
    try{
      await processing;
      res.writeHead(200);res.end("ok");
    }catch(error){
      // Do not acknowledge failed updates; Telegram will retry. Never log
      // message content, account identifiers, tokens or full upstream URLs.
      console.error("Telegram update processing failed:",String(error.message).slice(0,130));
      res.writeHead(503);res.end("retry");
    }
  });
  return server;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createTelegramApp({
    token:process.env.TELEGRAM_BOT_TOKEN,
    secret:process.env.TELEGRAM_WEBHOOK_SECRET,
    githubToken:process.env.GITHUB_ISSUES_TOKEN,
    dataDir:process.env.DATA_DIR||"/data"
  });
  const port=Number(process.env.PORT||3000);
  server.listen(port,"0.0.0.0",()=>console.log("Telegram webhook listening on port "+port));
}
