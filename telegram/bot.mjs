/* Telegram update parser. No GitHub credentials or public identity attribution. */
import { menuChoice } from "./menu.mjs";
export const CODE_PATTERN = /^[A-Z0-9]{6}$/;

export const BOT_COMMANDS = [
  {command:"start",description:"Help and contribution guide"},
  {command:"codes",description:"Browse recently published codes"},
  {command:"status",description:"Check a code or pending review"},
  {command:"submit",description:"Suggest a public invite code"},
  {command:"report",description:"Report a code you tried"},
  {command:"count",description:"GitHub owner-only count guidance"},
  {command:"privacy",description:"Read privacy and public posting rules"},
  {command:"get",description:"View and copy a published invite"},
  {command:"search",description:"Search codes or contributors"},
  {command:"new",description:"Recently published codes"},
  {command:"my",description:"Your Telegram submissions"},
  {command:"watch",description:"Follow a code's publication"},
  {command:"unwatch",description:"Stop following a code"},
  {command:"watchlist",description:"Manage followed codes"},
  {command:"subscribe",description:"Enable new-code alerts"},
  {command:"unsubscribe",description:"Disable new-code alerts"},
  {command:"settings",description:"Private chat preferences"},
  {command:"delete_data",description:"Clear private bot profile"},
  {command:"cancel",description:"Cancel a confirmation"}
];

export function formatCodeStatus(code,entry) {
  const url=entry.url||"https://muse.eplus.dev/#codes";
  if(entry.kind==="listed") {
    const status={
      unverified:"Unverified",
      "reported-working":"Community-reported working (not Muse-verified)",
      "reported-not-working":"Community-reported not working (not Muse-verified)"
    }[entry.status]||"Community listing (not Muse-verified)";
    const remaining=Number.isSafeInteger(entry.reportedRemaining)&&entry.reportedRemaining>=0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.usageReportedAt||"")
      ? "Reported remaining: "+entry.reportedRemaining+" (as of "+entry.usageReportedAt+"; not live)."
      : "Remaining invites: not reported with a date (not live).";
    return "Code "+code+" is published.\nStatus: "+status+".\n"+remaining+
      "\nA listing never guarantees redemption.\n"+url;
  }
  if(entry.kind==="pending")return "Code "+code+
    " has an open GitHub submission/discussion Issue but is not published yet. "+
    "A maintainer must review it; acceptance is not guaranteed.\n"+url;
  if(entry.kind==="closed")return "Code "+code+
    " appeared in a closed GitHub Issue but is not currently published. "+
    "Closure does not prove acceptance or rejection.\n"+url;
  return "Code "+code+
    " is not in the published directory or existing contribution Issues. "+
    "To suggest it, send /submit "+code+".\n"+url;
}


export function parseCommand(text) {
  if (typeof text !== "string" || text.length > 300) return {type:"help"};
  const selected=menuChoice(text.trim());
  if(selected)return {type:selected};
  const parts=text.trim().split(/\s+/);
  const command=(parts[0]||"").toLowerCase().replace(/@[a-z0-9_]+$/i,"");
  if (command==="/start"||command==="/help") return {type:"help"};
  if (command==="/codes") return {type:"browse"};
  if (command==="/new") return {type:"newest"};
  if (command==="/my") return {type:"my-codes"};
  if (command==="/settings") return {type:"settings"};
  if (command==="/watchlist") return {type:"watchlist"};
  if (command==="/subscribe") return {type:"subscribe"};
  if (command==="/unsubscribe") return {type:"unsubscribe"};
  if (command==="/delete_data") return {type:"delete-data"};
  if (command==="/watch"||command==="/unwatch"||command==="/get") {
    const code=parts[1]?.toUpperCase()||"";
    const kind={"/watch":"watch","/unwatch":"unwatch","/get":"get"}[command];
    return parts.length===2&&CODE_PATTERN.test(code)?{type:kind,code}:{type:"usage-code"};
  }
  if (command==="/search")return parts.length>1 ? {type:"search",query:parts.slice(1).join(" ").slice(0,80)} : {type:"prompt-search"};
  if (command==="/privacy") return {type:"privacy"};
  if (command==="/cancel") return {type:"cancel"};
  if (command==="/status"||command==="/code") {
    const code=parts[1]?.toUpperCase()||"";
    return parts.length===2&&CODE_PATTERN.test(code) ? {type:"status",code} : {type:"usage-status"};
  }
  if (command==="/count") return {type:"count",code:parts[1]?.toUpperCase()||""};
  if (command==="/submit") {
    const code=parts[1]?.toUpperCase()||"";
    return parts.length===2&&CODE_PATTERN.test(code) ? {type:"confirm-submit",code} : {type:"usage-submit"};
  }
  if (command==="/report") {
    const code=parts[1]?.toUpperCase()||"";
    const result=parts[2]?.toLowerCase();
    return parts.length===3&&CODE_PATTERN.test(code)&&["worked","failed"].includes(result)
      ? {type:"confirm-report",code,result}
      : {type:"usage-report"};
  }
  if(text.trim()&&!text.trim().startsWith("/"))return {type:"text",text:text.trim()};
  return {type:"help"};
}

export function parseUpdate(update) {
  if (!Number.isSafeInteger(update?.update_id)||update.update_id<0) return null;
  if (update.message && !update.message.from?.is_bot) {
    const message=update.message;
    const chat=message.chat;
    if (!Number.isSafeInteger(chat?.id)) return null;
    if (chat.type!=="private") return {type:"private-only",chatId:chat.id,updateId:update.update_id};
    return {...parseCommand(message.text),chatId:chat.id,updateId:update.update_id};
  }
  const callback=update.callback_query;
  if (!callback || typeof callback.id!=="string" ||
      !Number.isSafeInteger(callback.from?.id) ||
      callback.message?.chat?.type!=="private" ||
      callback.message.chat.id!==callback.from.id) return null;
  const data=callback.data||"";
  const matchSubmit=/^t:submit:([A-Z0-9]{6})$/.exec(data);
  const matchPick=/^t:pick:([A-Z0-9]{6}):(worked|failed)$/.exec(data);
  const matchWatch=/^t:watch:([A-Z0-9]{6})$/.exec(data);
  const matchSubscription=/^t:sub:(on|off)$/.exec(data);
  const matchReport=/^t:report:([A-Z0-9]{6}):(worked|failed)$/.exec(data);
  return {
    type:matchSubmit?"submit":matchReport?"report":matchPick?"confirm-report":
      matchWatch?"watch":matchSubscription?(matchSubscription[1]==="on"?"subscribe":"unsubscribe"):
      data==="t:watchlist"?"watchlist":data==="t:erase:ask"?"delete-data":
      data==="t:erase:confirm"?"delete-confirm":"cancel",
    code:matchSubmit?.[1]||matchReport?.[1]||matchPick?.[1]||matchWatch?.[1],
    result:matchReport?.[2]||matchPick?.[2],
    chatId:callback.from.id,
    callbackId:callback.id,
    messageId:Number.isSafeInteger(callback.message?.message_id)&&callback.message.message_id>0
      ? callback.message.message_id : null,
    updateId:update.update_id
  };
}
export function keyboard(buttons) {
  return {inline_keyboard:buttons.map(row=>row.map(button=>({
    text:button.text,url:button.url,callback_data:button.data,
    copy_text:button.copy_text
  })).map(button=>Object.fromEntries(Object.entries(button).filter(([,value])=>value!==undefined))))};
}
