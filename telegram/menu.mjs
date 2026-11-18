/* Localized Telegram keyboards; callback values remain stable across languages. */
import { LOCALES, MENU_KEYS, ENTRY_MENU_KEYS, ROLE_MENU_KEYS, menuText, tr } from "./i18n.mjs";
export const MENU = MENU_KEYS.map(row=>row.map(key=>menuText("en",key)));
export function replyKeyboard(language="en",role="legacy") {
  const layout=role===null?ENTRY_MENU_KEYS:ROLE_MENU_KEYS[role]||MENU_KEYS;
  return {
    keyboard:layout.map(row=>row.map(key=>menuText(language,key))),
    resize_keyboard:true,
    is_persistent:true,
    one_time_keyboard:false,
    input_field_placeholder:tr(language,"placeholder")
  };
}
export const REPLY_KEYBOARD=replyKeyboard("en");
const actions=new Map();
for(const lang of LOCALES){
  for(const row of [...MENU_KEYS,...ENTRY_MENU_KEYS,
    ...ROLE_MENU_KEYS.seeker,...ROLE_MENU_KEYS.contributor]){
    for(const key of row) {
      const type={
        browse:"browse",newest:"newest",search:"prompt-search",
        submit:"prompt-submit",mine:"my-codes",report:"prompt-report",
        notifications:"notifications",watchlist:"watchlist",settings:"settings",
        need:"need-code",status:"prompt-status",roleSwitch:"choose-role",
        roleSeeker:"set-role-seeker",roleContributor:"set-role-contributor",
        languageButton:"choose-language",refresh:"refresh"
      }[key];
      actions.set(menuText(lang,key),type);
    }
  }
  // Old Telegram clients can still send a stale Refresh keyboard label.
  actions.set(menuText(lang,"refresh"),"refresh");
}
export function menuChoice(text) { return actions.get(text)||null; }
export function codeButtons(code,language="en") {
  return [
    [{text:tr(language,"copy",{code}),copy_text:{text:code}},
     {text:tr(language,"details"),url:"https://muse.eplus.dev/codes/"+code+"/"}],
    [{text:tr(language,"watch"),data:"t:watch:"+code},
     {text:tr(language,"worked"),data:"t:pick:"+code+":worked"},
     {text:tr(language,"failed"),data:"t:pick:"+code+":failed"}],
    [{text:menuText(language,"refresh"),data:"t:refresh-code:"+code}],
    [{text:tr(language,"backList"),data:"t:back-list"},
     {text:tr(language,"backMenu"),data:"t:home"}]
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
  const extra=[
    tr(language,"platformLabel")+" "+(entry.platform||"GitHub"),
    ...(entry.submittedBy?[tr(language,"contributorLabel")+" "+entry.submittedBy]:[]),
    ...(entry.addedAt?[tr(language,"addedLabel")+" "+entry.addedAt]:[])
  ];
  return "🎟 "+tr(language,"detailTitle")+" — "+code+"\n"+
    tr(language,status)+" · "+tr(language,"cardHeader")+"\n"+
    extra.join("\n")+"\n"+
    tr(language,"remainingLabel")+" "+count+"\n"+tr(language,"cardDisclaimer");
}
