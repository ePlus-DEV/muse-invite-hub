/* Localized Telegram keyboards; callback values remain stable across languages. */
import { LOCALES, MENU_KEYS, menuText, tr, normalizeLocale } from "./i18n.mjs";
export const MENU = MENU_KEYS.map(row=>row.map(key=>menuText("vi",key)));
export function replyKeyboard(language="vi") {
  return {
    keyboard:MENU_KEYS.map(row=>row.map(key=>menuText(language,key))),
    resize_keyboard:true,
    is_persistent:true,
    one_time_keyboard:false,
    input_field_placeholder:tr(language,"placeholder")
  };
}
export const REPLY_KEYBOARD=replyKeyboard("vi");
const actions=new Map();
for(const lang of LOCALES){
  for(const row of MENU_KEYS){
    for(const key of row) {
      const type={
        browse:"browse",newest:"newest",search:"prompt-search",
        submit:"prompt-submit",mine:"my-codes",report:"prompt-report",
        notifications:"notifications",watchlist:"watchlist",settings:"settings"
      }[key];
      actions.set(menuText(lang,key),type);
    }
  }
}
export function menuChoice(text) { return actions.get(text)||null; }
export function codeButtons(code,language="en") {
  return [
    [{text:tr(language,"copy",{code}),copy_text:{text:code}},
     {text:tr(language,"details"),url:"https://muse.eplus.dev/codes/"+code+"/"}],
    [{text:tr(language,"watch"),data:"t:watch:"+code},
     {text:tr(language,"worked"),data:"t:pick:"+code+":worked"},
     {text:tr(language,"failed"),data:"t:pick:"+code+":failed"}]
  ];
}
export function codeDescription(entry,language="en") {
  const code=entry.code;
  if(!/^[A-Z0-9]{6}$/.test(code))throw Error("Invalid published code");
  const status=entry.status==="reported-working"?"cardStatusWorking":
    entry.status==="reported-not-working"?"cardStatusFailed":"statusUnverified";
  const count=entry.remaining===null||entry.remaining===undefined
    ? tr(language,"cardUnknown")
    : tr(language,"cardRemaining",{count:entry.remaining,date:entry.usageReportedAt});
  return "🎟 "+code+"\n"+tr(language,status)+" · "+tr(language,"cardHeader")+
    "\n"+tr(language,"remainingLabel")+" "+count+"\n"+tr(language,"cardDisclaimer");
}
