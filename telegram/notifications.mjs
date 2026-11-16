/* Trusted post-Pages notifications. Chat IDs exist only in private server/KV storage.
 * A signed Pages event never establishes Muse validity or code ownership.
 */
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
  const headline=personal.length?"✅ Your Telegram contribution is now published.":
    watched.length?"📌 A watched invite was published.":"🆕 New Muse Invite Hub community codes.";
  const list=relevant.slice(0,25).map(code=>
    "• "+code+" — https://muse.eplus.dev/codes/"+code+"/").join("\n");
  const overflow=relevant.length>25?"\n+"+(relevant.length-25)+" more: https://muse.eplus.dev/#codes":"";
  return {codes:relevant,text:headline+"\n"+list+overflow+
    "\nThese listings are community-reported, NOT Muse-verified or guaranteed to redeem."};
}
/* state: getBaseline, setBaseline, listProfiles(cursor,limit), wasSent, markSent.
 * send: sends an ordinary private Telegram message and throws on failure.
 * One profile = at most one message per deployment batch, independent of how
 * many reasons they opted in. A retry skips recipients already acknowledged.
 */
export async function publishNotifications({event,state,catalog,send,logger=()=>{}}) {
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
      subscribed:profile.subscribed,
      watching:(profile.watching||[]).filter(x=>due.includes(x)),
      submitted:(profile.submitted||[]).filter(x=>due.includes(x.code))
    },due);
    if(!relevant)continue;
    try{
      await send(chatId,relevant.text);
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

export async function notificationResponse(request,{secret,state,catalog,send,logger}) {
  if(typeof secret!=="string"||secret.length<24)return new Response("notifications not configured",{status:503});
  const event=await parseSignedEvent(request,secret);
  if(!event)return new Response("forbidden",{status:403});
  try {
    const result=await publishNotifications({event,state,catalog,send,logger});
    return new Response(JSON.stringify(result),{
      status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
    });
  }catch(error){
    logger?.("Notification reconciliation failed: "+String(error.message).slice(0,120));
    return new Response("retry",{status:503});
  }
}
