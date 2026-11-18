/* Telegram update parser. No GitHub credentials or public identity attribution. */
import { menuChoice } from "./menu.mjs";
import { normalizeLocale, tr } from "./i18n.mjs";
export const CODE_PATTERN = /^[A-Z0-9]{6}$/;
// Telegram @username is public only after explicit consent; never expose numeric IDs.
export const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const publicUsername = name => typeof name==="string"&&TELEGRAM_USERNAME.test(name)?name:null;

export const BOT_COMMANDS = [
  {command:"start",description:"Help and contribution guide"},
  {command:"codes",description:"Browse recently published codes"},
  {command:"refresh",description:"Reload the latest published community codes"},
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
  {command:"language",description:"Change bot language"},
  {command:"role",description:"Choose how to use this bot"},
  {command:"need",description:"Find an invite code or request new-code alerts"},
  {command:"delete_data",description:"Clear private bot profile"},
  {command:"cancel",description:"Cancel a confirmation"}
];

export function formatCodeStatus(code,entry,language="en") {
  const url=entry.url||"https://muse.eplus.dev/#codes";
  if(entry.kind==="listed") {
    const status={
      unverified:"statusUnverified",
      "reported-working":"statusWorking",
      "reported-not-working":"statusFailed"
    }[entry.status]||"statusOther";
    const dated=Number.isSafeInteger(entry.reportedRemaining)&&entry.reportedRemaining>=0&&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.usageReportedAt||"");
    const remaining=dated
      ? tr(language,"reportedRemaining",{count:entry.reportedRemaining,date:entry.usageReportedAt})
      : Number.isSafeInteger(entry.policyDefaultRemaining)&&
          entry.policyDefaultRemaining===30
        ? tr(language,"policyDefaultRemaining",{count:entry.policyDefaultRemaining})
        : tr(language,"remainingUnknown");
    return tr(language,"codePublished",{code})+"\n"+tr(language,"statusLabel")+" "+
      tr(language,status)+".\n"+remaining+"\n"+tr(language,"listedDisclaimer")+"\n"+url;
  }
  const key=entry.kind==="pending"?"codePending":
    entry.kind==="closed"?"codeClosed":"codeUnknown";
  return tr(language,key,{code})+"\n"+url;
}

export function parseCommand(text) {
  if (typeof text !== "string" || text.length > 300) return {type:"help"};
  const selected=menuChoice(text.trim());
  if(selected)return {type:selected};
  const parts=text.trim().split(/\s+/);
  const command=(parts[0]||"").toLowerCase().replace(/@[a-z0-9_]+$/i,"");
  if (command==="/start"||command==="/help"||command==="/menu") return {type:"help"};
  if (command==="/role"||command==="/roles")return {type:"choose-role"};
  if (command==="/need"||command==="/request")return {type:"need-code"};
  if (command==="/codes") return {type:"browse"};
  if (command==="/refresh") return {type:"refresh"};
  if (command==="/new") return {type:"newest"};
  if (command==="/my") return {type:"my-codes"};
  if (command==="/settings") return {type:"settings"};
  if (command==="/language"||command==="/lang") {
    if(parts.length===1)return {type:"choose-language"};
    const requested=parts[1]?.toLowerCase()||"";
    return parts.length===2&&["en","vi","ja"].includes(requested)
      ? {type:"set-language",language:requested}:{type:"choose-language"};
  }
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
    // Telegram private-chat commands must be from the private-chat owner.
    if (!Number.isSafeInteger(message.from?.id) || message.from.id!==chat.id) return null;
    return {...parseCommand(message.text),chatId:chat.id,updateId:update.update_id,
      ...(typeof message.from?.language_code==="string"?{telegramLanguage:message.from.language_code}:{}),
      telegramUsername:publicUsername(message.from?.username)};
  }
  const callback=update.callback_query;
  if (!callback || typeof callback.id!=="string" ||
      callback.from?.is_bot===true ||
      !Number.isSafeInteger(callback.from?.id) ||
      callback.message?.chat?.type!=="private" ||
      callback.message.chat.id!==callback.from.id) return null;
  const data=callback.data||"";
  const matchSubmit=/^t:submit:([A-Z0-9]{6})$/.exec(data);
  const matchPick=/^t:pick:([A-Z0-9]{6}):(worked|failed)$/.exec(data);
  const matchWatch=/^t:watch:([A-Z0-9]{6})$/.exec(data);
  const matchUnwatch=/^t:unwatch:([A-Z0-9]{6})$/.exec(data);
  const matchRefreshCode=/^t:refresh-code:([A-Z0-9]{6})$/.exec(data);
  const matchDetail=/^t:detail:([A-Z0-9]{6})$/.exec(data);
  const matchPage=/^t:page:(0|[1-9][0-9]?)$/.exec(data);
  const matchSubscription=/^t:sub:(on|off)$/.exec(data);
  const matchLanguage=/^t:lang:(en|vi|ja)$/.exec(data);
  const matchRole=/^t:role:(seeker|contributor)$/.exec(data);
  const matchReport=/^t:report:([A-Z0-9]{6}):(worked|failed)$/.exec(data);
  return {
    type:matchSubmit?"submit":matchReport?"report":matchPick?"confirm-report":
      matchWatch?"watch":matchUnwatch?"unwatch":matchRefreshCode?"refresh-code":
      matchDetail?"detail":matchPage?"page":matchSubscription?(matchSubscription[1]==="on"?"subscribe":"unsubscribe"):
      matchLanguage?"set-language":data==="t:langs"?"choose-language":
      matchRole?(matchRole[1]==="seeker"?"set-role-seeker":"set-role-contributor"):
      data==="t:roles"?"choose-role":data==="t:need"?"need-code":
      data==="t:need:browse"?"browse":data==="t:need:alerts"?"subscribe":
      data==="t:need:search"?"prompt-search":
      data==="t:settings"?"settings":data==="t:mine"?"my-codes":
      data==="t:prompt-submit"?"prompt-submit":data==="t:newest"?"newest":
      data==="t:search"?"prompt-search":
      data==="t:home"?"home":data==="t:back-list"?"back-list":
      data==="t:refresh"?"refresh":data==="t:browse"?"browse":
      data==="t:watchlist"?"watchlist":data==="t:erase:ask"?"delete-data":
      data==="t:erase:confirm"?"delete-confirm":"cancel",
    ...(matchLanguage?{language:matchLanguage[1]}:{}),
    code:matchSubmit?.[1]||matchReport?.[1]||matchPick?.[1]||matchWatch?.[1]||matchRefreshCode?.[1]||matchDetail?.[1]||matchUnwatch?.[1],
    ...(matchPage?{page:Number(matchPage[1])}:{}),
    result:matchReport?.[2]||matchPick?.[2],
    chatId:callback.from.id,
    ...(typeof callback.from?.language_code==="string"?{telegramLanguage:callback.from.language_code}:{}),
    telegramUsername:publicUsername(callback.from?.username),
    callbackId:callback.id,
    messageId:Number.isSafeInteger(callback.message?.message_id)&&callback.message.message_id>0
      ? callback.message.message_id : null,
    updateId:update.update_id
  };
}
export function keyboard(buttons) {
  return {inline_keyboard:buttons.map(row=>row.map(button=>({
    text:button.text,url:button.url,callback_data:button.data,
    copy_text:button.copy_text,style:button.style
  })).map(button=>Object.fromEntries(Object.entries(button).filter(([,value])=>value!==undefined))))};
}
