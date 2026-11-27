/* Minimal opt-in private Telegram preferences. Never expose chat IDs in GitHub Issues. */
import { LOCALES, normalizeLocale } from "./i18n.mjs";
const CODE=/^[A-Z0-9]{6}$/;
const INTENTS=new Set(["search","submit","report","status"]);
const MENU_VERSION=/^v[1-9][0-9]*-[0-9a-f]{8}$/;
// Legacy profiles retain their previous behavior. New-code broadcasts remain
// opt-in through subscribed; watch/contribution alerts are independently configurable.
export function notificationSettings(profile={}) {
  const v=profile.notifications||{};
  return {
    enabled:v.enabled!==false,
    personal:v.personal!==false,
    watched:v.watched!==false,
    quota:v.quota===true,
    minutes:[0,10,60].includes(v.minutes)?v.minutes:10
  };
}
export function emptyProfile() {
  return {subscribed:false,notifications:notificationSettings(),watching:[],submitted:[],pending:null,language:null,languageManual:false,role:null,browse:null,panelMessageId:null,menuVersion:null};
}
export function cleanProfile(value) {
  const base=emptyProfile();
  if(!value||typeof value!=="object")return base;
  return {
    subscribed:value.subscribed===true,
    notifications:notificationSettings(value),
    role:value.role==="seeker"||value.role==="contributor"?value.role:null,
    language:LOCALES.includes(value.language)?value.language:null,
    languageManual:value.languageManual===true&&LOCALES.includes(value.language),
    menuVersion:typeof value.menuVersion==="string"&&MENU_VERSION.test(value.menuVersion)
      ? value.menuVersion:null,
    // A bot-owned message ID allows editing one navigation panel from reply-keyboard actions.
    // It is private chat state, not a public invite or Telegram identity claim.
    panelMessageId:Number.isSafeInteger(value.panelMessageId)&&value.panelMessageId>0
      ? value.panelMessageId:null,
    // Only a small navigation context is retained; never store invite catalog data.
    browse:value.browse&&typeof value.browse==="object"&&!Array.isArray(value.browse)&&
      Number.isSafeInteger(value.browse.page)&&value.browse.page>=0&&value.browse.page<=99
      ? {query:typeof value.browse.query==="string"
          ? value.browse.query.trim().slice(0,80):"",
        newest:value.browse.newest===true,page:value.browse.page}:null,
    watching:Array.isArray(value.watching)
      ? [...new Set(value.watching.filter(v=>typeof v==="string"&&CODE.test(v)))].slice(0,50):[],
    submitted:Array.isArray(value.submitted)
      ? value.submitted.filter(x=>x&&CODE.test(x.code)&&
          /^https:\/\/github\.com\/ePlus-DEV\/muse-invite-hub\/issues\/[1-9]\d*$/.test(x.url||""))
          .slice(-50).map(x=>({code:x.code,url:x.url})):[],
    pending:value.pending&&INTENTS.has(value.pending.type)&&
      Number.isSafeInteger(value.pending.until)&&value.pending.until>Date.now()
      ? {type:value.pending.type,until:value.pending.until}:null
  };
}
export function makeKvProfiles(kv) {
  const key=id=>"profile:"+String(id);
  return {
    async get(id){const value=await kv.get(key(id));return cleanProfile(value?JSON.parse(value):null);},
    async set(id,profile){await kv.put(key(id),JSON.stringify(cleanProfile(profile)));},
    async delete(id){await kv.delete(key(id));}
  };
}
export async function mutateProfile(profiles,chatId,fn) {
  const profile=await profiles.get(chatId);
  const next=fn(profile)||profile;
  await profiles.set(chatId,next);
  return cleanProfile(next);
}

/* The bot follows the Telegram client's language (normalized to a supported
 * locale, English when unsupported) until the user explicitly picks a
 * language via /language or the Settings menu; a manual choice always wins
 * and is never overwritten by later Telegram language changes.
 */
export async function syncTelegramLocale(profiles,chatId,telegramLanguage) {
  const profile=await profiles.get(chatId);
  if(profile.languageManual)return profile.language;
  const detected=normalizeLocale(telegramLanguage);
  if(profile.language!==detected){
    profile.language=detected;
    await profiles.set(chatId,profile);
  }
  return detected;
}
