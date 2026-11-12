import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { parseUpdate, keyboard } from "./bot.mjs";
import { listRecentCodes, submitNewCode, submitFeedback } from "./github.mjs";

const SITE="https://muse.eplus.dev";
const MAX_BODY=32*1024;

function constantTimeEqual(actual,expected) {
  if(typeof actual!=="string"||typeof expected!=="string")return false;
  const one=Buffer.from(actual),two=Buffer.from(expected);
  return one.length===two.length&&timingSafeEqual(one,two);
}
export function createTelegramApp({
  token,secret,githubToken,dataDir="/data",
  telegramApi,services={listRecentCodes,submitNewCode,submitFeedback}
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
  const strikes=new Map();
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
  function allowWrite(chatId) {
    const now=Date.now();
    const recent=(strikes.get(chatId)||[]).filter(value=>now-value<3600000);
    if(recent.length>=8){strikes.set(chatId,recent);return false;}
    recent.push(now);
    strikes.set(chatId,recent);
    return true;
  }
  async function handle(update){
    const action=parseUpdate(update);
    if(!action)return;
    const {chatId,type,code,result,updateId}=action;
    if(action.callbackId){
      await call("answerCallbackQuery",{callback_query_id:action.callbackId});
    }
    switch(type){
      case "private-only":
        return send(chatId,"Please open this bot in a private chat to protect your reports.");
      case "help":
        return send(chatId,[
          "✦ Muse Invite Hub — community invite directory",
          "",
          "/codes — browse recent public invite codes",
          "/submit CODE — suggest a new public invite code",
          "/report CODE worked — report a successful try",
          "/report CODE failed — report an unsuccessful try",
          "/count CODE — owner-only count update guidance",
          "",
          "Reports require confirmation and are reviewed on GitHub.",
          "Never share passwords, one-time login codes or private links."
        ].join("\n"),[[{text:"Browse all codes",url:SITE+"/#codes"}]]);
      case "codes":{
        const latest=await services.listRecentCodes();
        return send(chatId,latest.length
          ? "Recent published codes (not guaranteed to work):\n\n"+
            latest.map(x=>"• "+x).join("\n")
          : "No published codes found. Please check the website.",[
            [{text:"Browse and copy codes",url:SITE+"/#codes"}]
          ]);
      }
      case "count":
        return send(chatId,"Owner-only quota changes require a verified GitHub account. "+
          "Telegram identity is not proof of ownership. Open your listing and choose Update count.",
          [[{text:"Open directory",url:SITE+"/#codes"}]]);
      case "usage-submit":
        return send(chatId,"Use /submit CODE (4–32 letters/digits/hyphens), for example /submit DPNIHH. "+
          "Only share a public invite, not private credentials.");
      case "usage-report":
        return send(chatId,"Use /report CODE worked or /report CODE failed. "+
          "This is a community report, not Muse verification.");
      case "confirm-submit":
        return send(chatId,"Share public invite code "+code+"?\n"+
          "This will create a PUBLIC GitHub Issue for maintainer review. "+
          "No Telegram username or account ID is published. This does not verify ownership or redeem the code.",[
          [{text:"Confirm public submission",data:"t:submit:"+code}],
          [{text:"Cancel",data:"t:cancel"}]
        ]);
      case "confirm-report":
        return send(chatId,"Report "+code+" as "+result+"?\n"+
          "This posts an anonymous PUBLIC comment to the code's existing GitHub Issue. "+
          "A maintainer will review it; status is not automatically changed.",[
          [{text:"Confirm public report",data:"t:report:"+code+":"+result}],
          [{text:"Cancel",data:"t:cancel"}]
        ]);
      case "cancel":return send(chatId,"Cancelled. No information was submitted.");
      case "submit":{
        if(!allowWrite(chatId))return send(chatId,"Too many submissions. Try again later.");
        const outcome=await services.submitNewCode(code,updateId,githubToken);
        const message={
          listed:"This code is already in the published directory.",
          pending:"A Telegram contribution Issue already exists; no duplicate was created.",
          submitted:"Submitted a public GitHub Issue for human review. This does not publish or verify the code."
        }[outcome.kind]||"Please review this code's status.";
        return send(chatId,message+"\n"+outcome.url);
      }
      case "report":{
        if(!allowWrite(chatId))return send(chatId,"Too many reports. Try again later.");
        const outcome=await services.submitFeedback(code,result,updateId,githubToken);
        const message={
          unknown:"This code is not currently in the published catalog.",
          unmapped:"A canonical GitHub Issue is not yet available; use the website to report.",
          "already-reported":"This Telegram report was already received; no duplicate was posted.",
          reported:"Added feedback to the code's existing GitHub Issue for human review. No Muse status changed."
        }[outcome.kind]||"Please review this code's status.";
        return send(chatId,message+"\n"+outcome.url);
      }
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
