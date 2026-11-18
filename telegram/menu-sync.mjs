/* One version-aware Reply Keyboard sync for Worker KV and OCI file profiles.
 * A layout fingerprint changes only when the menu changes, not every deploy.
 * The bot updates a stale keyboard once on a later chat interaction.
 */
import {replyKeyboard} from "./menu.mjs";
import {mutateProfile} from "./profiles.mjs";
import {tr} from "./i18n.mjs";

export const MENU_SCHEMA_VERSION=1;

export function menuVersion(language="en",role=null) {
  const signature=JSON.stringify({schema:MENU_SCHEMA_VERSION,
    keyboard:replyKeyboard(language,role)});
  let hash=2166136261;
  for(let i=0;i<signature.length;i++){
    hash^=signature.charCodeAt(i);
    hash=Math.imul(hash,16777619)>>>0;
  }
  return "v"+MENU_SCHEMA_VERSION+"-"+hash.toString(16).padStart(8,"0");
}

export function createMenuSync({profiles,sendMenu,action,priorProfile}) {
  let sentMenu=false;
  const isPrivate=action.type!=="private-only";
  // Deleting private data should not immediately recreate a profile record.
  const forget=action.type==="delete-confirm";
  const trackedSendMenu=async(chatId,text,language="en",role=null)=>{
    const result=await sendMenu(chatId,text,language,role);
    sentMenu=true; // Successful Telegram send; never send a second menu on this update.
    if(!forget) {
      try {
        await mutateProfile(profiles,chatId,p=>{
          p.menuVersion=menuVersion(language,role);
          // Sending a fresh Reply Keyboard starts a new navigation session.
          // An old saved inline panel may be dozens of messages above this
          // one; editing it hides the result of the user's current action.
          // Clear only this UI pointer, not their role, language, pending
          // search, watched codes or contribution history. The next panel
          // is sent beside the new keyboard and saves its fresh message ID.
          p.panelMessageId=null;
          return p;
        });
      } catch {
        // The keyboard has already reached Telegram. Do not retry a public
        // contribution just because recording our private preference failed.
      }
    }
    return result;
  };
  const syncIfNeeded=async(chatId)=>{
    if(!isPrivate||forget||sentMenu)return false;
    // These actions already replace the Reply Keyboard. Do not send the
    // previous version first and then the new one in the same update.
    if (["help","sync-menu","set-role-seeker","set-role-contributor",
         "set-language","usage-menu"].includes(action.type) ||
        (action.type==="home"&&!action.callbackId)) return false;
    let profile;
    try {profile=await profiles.get(chatId);}
    catch {return false;}
    const language=profile.language||"en";
    const role=profile.role;
    const expected=menuVersion(language,role);
    if(profile.menuVersion===expected)return false;
    // First-time API-only users may have no prior keyboard. Avoid an
    // unsolicited second message on their first status / submit callback.
    // Any old reply-keyboard tap is explicit evidence of a stale keyboard.
    // Determine whether a keyboard was already in use BEFORE this action.
    // Creating a new inline panel right now must not trigger an extra message.
    const previous=priorProfile||profile;
    const prior=Boolean(previous.menuVersion||action.fromMenu||previous.role||
      previous.panelMessageId||previous.languageManual||previous.subscribed||
      previous.watching?.length||previous.submitted?.length);
    if(!prior)return false;
    try {
      await trackedSendMenu(chatId,tr(language,"menuAutoUpdated"),language,role);
      return true;
    } catch {
      // Best-effort UI sync: don't force webhook retries after GitHub writes.
      // No version is recorded if Telegram rejected the keyboard send.
      return false;
    }
  };
  return {trackedSendMenu,syncIfNeeded};
}
