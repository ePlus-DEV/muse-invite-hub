/* Trusted post-Pages notifications. Chat IDs exist only in private server/KV storage.
 * A signed Pages event never establishes Muse validity or code ownership.
 */
import { tr } from "./i18n.mjs";
export const NOTIFY_PATH="/telegram/notify";
const CODE=/^[A-Z0-9]{6}$/;
const SHA=/^[a-f0-9]{40}$/;
const MAX_BYTES=4096;
function hex(bytes){return Array.from(bytes,v=>v.toString(16).padStart(2,"0")).join("");}
export async function hmacSignature(secret,timestamp,body) {
  if(typeof secret!=="string"||secret.length<24)throw Error("Missing private notification secret");
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,
    enc.encode(String(timestamp)+"."+body))));
}
function sameHex(a,b) {
  if(!/^[0-9a-f]{64}$/.test(a||"")||!/^[0-9a-f]{64}$/.test(b||""))return false;
  const one=Uint8Array.from(a.match(/../g),h=>parseInt(h,16));
  const two=Uint8Array.from(b.match(/../g),h=>parseInt(h,16));
  let different=0;
  for(let i=0;i<one.length;i++)different|=one[i]^two[i];
  return different===0;
}
export async function parseSignedEvent(request,secret,now=Date.now()) {
  if(request.method!=="POST"||!secret)return null;
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>MAX_BYTES)return null;
  const ts=request.headers.get("x-muse-notify-timestamp");
  const signature=request.headers.get("x-muse-notify-signature");
  if(!/^\d{13}$/.test(ts||"")||Math.abs(now-Number(ts))>300000)return null;
  const expected=await hmacSignature(secret,ts,raw);
  if(!sameHex(signature?.replace(/^sha256=/,""),expected))return null;
  let input;
  try {input=JSON.parse(raw);}catch{return null;}
  if(input?.event!=="pages-published"||!SHA.test(input.sha||"")||
     (input.cursor!==null&&input.cursor!==undefined&&
      (typeof input.cursor!=="string"||input.cursor.length>512)))return null;
  return {sha:input.sha,cursor:input.cursor||undefined};
}
function normalizeCatalog(catalog) {
  if(!Array.isArray(catalog))throw Error("Invalid published catalog");
  const codes=catalog.map(row=>row?.code);
  if(codes.some(code=>!CODE.test(code||""))||
     new Set(codes).size!==codes.length)throw Error("Invalid/duplicate published code");
  return codes;
}
function notice(profile,newCodes) {
  const personal=newCodes.filter(code=>profile.submitted?.some(x=>x.code===code));
  const watched=newCodes.filter(code=>profile.watching?.includes(code));
  const relevant=newCodes.filter(code=>profile.subscribed===true||
    personal.includes(code)||watched.includes(code));
  if(!relevant.length)return null;
  const language=profile.language||"en";
  const headline=tr(language,personal.length?"notifyPersonal":watched.length?"notifyWatched":"notifyNew");
  const list=relevant.slice(0,25).map(code=>
    "• "+code+" — https://muse.eplus.dev/codes/"+code+"/").join("\n");
  const overflow=relevant.length>25?"\n"+tr(language,"notifyMore",{count:relevant.length-25}):"";
  return {codes:relevant,text:headline+"\n"+list+overflow+
    "\n"+tr(language,"notifyDisclaimer")};
}
// Edit a recent notification instead of generating a new chat bubble for
// every separate Pages deployment. Fixed window (not sliding) so subsequent
// codes eventually produce a fresh Telegram push as expected.
export const DIGEST_WINDOW_MS=10*60*1000;
const MAX_DIGEST_CODES=25;
const EDIT_FALLBACK=/message to edit not found|message can't be edited|message identifier is not specified|message_id_invalid/i;
const NOT_MODIFIED=/message is not modified/i;

/* State optionally supports getDigest(chatId) and setDigest(chatId,digest).
 * Adapter send returns Telegram Message {message_id}; edit returns the result
 * from editMessageText. Missing digest support retains old send-once behavior.
 * One profile gets at most one action per Pages event and all new codes retain
 * per-chat, per-code markers. Partial delivery is retryable after failures.
 */
export async function publishNotifications({event,state,catalog,send,edit,now=Date.now(),logger=()=>{}}) {
  const current=normalizeCatalog(await catalog());
  const previous=await state.getBaseline();
  if(previous===null){
    await state.setBaseline(current);
    return {initialized:true,sent:0,complete:true};
  }
  if(!Array.isArray(previous)||previous.some(x=>!CODE.test(x)))throw Error("Invalid notification baseline");
  const old=new Set(previous);
  const newCodes=current.filter(code=>!old.has(code));
  if(!newCodes.length)return {sent:0,complete:true};
  const {profiles,cursor}=await state.listProfiles(event.cursor,10);
  let sent=0;
  for(const {chatId,profile} of profiles) {
    const info=notice(profile,newCodes);
    if(!info)continue;
    const due=[];
    for(const code of info.codes){
      if(!await state.wasSent(chatId,code))due.push(code);
    }
    if(!due.length)continue;
    const relevant=notice({
      language:profile.language,
      subscribed:profile.subscribed,
      watching:(profile.watching||[]).filter(x=>due.includes(x)),
      submitted:(profile.submitted||[]).filter(x=>due.includes(x.code))
    },due);
    if(!relevant)continue;
    try{
      let prior=typeof state.getDigest==="function"
        ? await state.getDigest(chatId):null;
      // A digest is editable for at most ten minutes and 25 codes. Beyond
      // that, send a fresh push so the user still sees subsequent releases.
      const withinWindow=prior&&Number.isSafeInteger(prior.messageId)&&
        prior.messageId>0&&Number.isSafeInteger(prior.at)&&
        now>=prior.at&&now-prior.at<DIGEST_WINDOW_MS&&
        Array.isArray(prior.codes)&&prior.codes.length>0&&
        typeof edit==="function";
      const combined=withinWindow
        ? [...new Set([...prior.codes,...due])]:due;
      const canEdit=withinWindow&&combined.length<=MAX_DIGEST_CODES;
      const digestText=canEdit
        ? notice({...profile,subscribed:true},combined).text:null;
      let edited=false, messageId=null, codes=due, at=now;
      if(canEdit) {
        try {
          await edit(chatId,prior.messageId,digestText);
          edited=true;
        } catch(error) {
          if(NOT_MODIFIED.test(String(error.message||"")))edited=true;
          else if(!EDIT_FALLBACK.test(String(error.message||"")))throw error;
        }
        if(edited) {
          messageId=prior.messageId;codes=combined;at=prior.at;
        }
      }
      if(!edited) {
        // An obsolete/deleted notification is not fatal: a new notification
        // still delivers every due code instead of silently skipping them.
        const result=await send(chatId,relevant.text);
        if(Number.isSafeInteger(result?.message_id)&&result.message_id>0)
          messageId=result.message_id;
      }
      // Persist the digest before marking code delivery. If marking fails,
      // a retry edits the same text; Telegram's "not modified" is success.
      if(messageId&&typeof state.setDigest==="function")
        await state.setDigest(chatId,{messageId,codes,at});
      for(const code of due)await state.markSent(chatId,code);
      sent++;
    }catch(error) {
      // Do not log Telegram identity. An aborted send can be retried.
      logger("Notification delivery failed: "+String(error.message).slice(0,120));
      throw error;
    }
  }
  if(cursor)return {sent,complete:false,nextCursor:cursor};
  await state.setBaseline(current);
  return {sent,complete:true};
}

export async function notificationResponse(request,{secret,state,catalog,send,edit,logger}) {
  if(typeof secret!=="string"||secret.length<24)return new Response("notifications not configured",{status:503});
  const event=await parseSignedEvent(request,secret);
  if(!event)return new Response("forbidden",{status:403});
  try {
    const result=await publishNotifications({event,state,catalog,send,edit,logger});
    return new Response(JSON.stringify(result),{
      status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
    });
  }catch(error){
    logger?.("Notification reconciliation failed: "+String(error.message).slice(0,120));
    return new Response("retry",{status:503});
  }
}
