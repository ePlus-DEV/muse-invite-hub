/* Minimal opt-in private Telegram preferences. Never expose chat IDs in GitHub Issues. */
const CODE=/^[A-Z0-9]{6}$/;
const INTENTS=new Set(["search","submit","report"]);
export function emptyProfile() {
  return {subscribed:false,watching:[],submitted:[],pending:null};
}
export function cleanProfile(value) {
  const base=emptyProfile();
  if(!value||typeof value!=="object")return base;
  return {
    subscribed:value.subscribed===true,
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
