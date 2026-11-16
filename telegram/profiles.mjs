/* Minimal opt-in private Telegram preferences. Never expose chat IDs in GitHub Issues. */
import { normalizeLocale, LOCALES } from "./i18n.mjs";
const CODE=/^[A-Z0-9]{6}$/;
const INTENTS=new Set(["search","submit","report","status"]);
export function emptyProfile() {
  return {subscribed:false,watching:[],submitted:[],pending:null,language:null,languageManual:false,role:null};
}
export function cleanProfile(value) {
  const base=emptyProfile();
  if(!value||typeof value!=="object")return base;
  return {
    subscribed:value.subscribed===true,
    role:value.role==="seeker"||value.role==="contributor"?value.role:null,
    language:LOCALES.includes(value.language)?value.language:null,
    languageManual:value.languageManual===true&&LOCALES.includes(value.language),
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

/* Telegram language_code auto-selection does not overwrite explicit preferences. */
export async function syncTelegramLocale(profiles,chatId,telegramLanguage) {
  const profile=await profiles.get(chatId);
  if(profile.languageManual)return profile.language;
  if(typeof telegramLanguage!=="string"||!telegramLanguage.trim())return profile.language||"en";
  const chosen=normalizeLocale(telegramLanguage);
  if(profile.language!==chosen){
    profile.language=chosen;
    await profiles.set(chatId,profile);
  }
  return chosen;
}
