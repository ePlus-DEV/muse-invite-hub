/* One version-aware Reply Keyboard sync for Worker KV and OCI file profiles.
 * A layout fingerprint changes only when the menu changes, not every deploy.
 * Sync is silent bookkeeping: the bot never sends a standalone "menu
 * updated" message and never consumes the user's tap to push a keyboard.
 * The client keyboard refreshes on the next menu message, which always
 * carries the current layout, and stale labels remain parseable meanwhile.
 * When a fresh menu message does replace the keyboard, the previous inline
 * panel is deleted from the chat instead of being left behind.
 */
import {replyKeyboard} from "./menu.mjs";
import {mutateProfile} from "./profiles.mjs";

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

export function createMenuSync({profiles,sendMenu,removeMessage,action}) {
  let sentMenu=false;
  const isPrivate=action.type!=="private-only";
  // Deleting private data should not immediately recreate a profile record.
  const forget=action.type==="delete-confirm";
  const trackedSendMenu=async(chatId,text,language="en",role=null)=>{
    if(!forget) {
      // Sending a fresh Reply Keyboard starts a new navigation session.
      // Delete the previous inline panel (e.g. an old Settings card) first,
      // so it does not linger in the chat after the user has moved on. If
      // the send below then fails, the saved pointer simply refers to a
      // gone message and the next panel falls back to a fresh send.
      try {
        const before=await profiles.get(chatId);
        if(before.panelMessageId&&typeof removeMessage==="function"){
          try {await removeMessage(chatId,before.panelMessageId);}
          catch { /* The panel may already be gone or too old to delete. */ }
        }
      } catch { /* Cleanup must never block the menu itself. */ }
    }
    const result=await sendMenu(chatId,text,language,role);
    sentMenu=true; // Successful Telegram send; never send a second menu on this update.
    if(!forget) {
      try {
        await mutateProfile(profiles,chatId,p=>{
          p.menuVersion=menuVersion(language,role);
          // Clear only this UI pointer — not their role, language, pending
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
    // Silent migration only: this never sends a message and never consumes
    // the user's action. A panel saved under a different menu version
    // belongs to an older session — editing it would surface results in a
    // card far above the current chat — so it is deleted and the action
    // opens a fresh panel beside the current position instead. Recording
    // the new fingerprint is harmless; a failure retries next interaction.
    // The keyboard itself catches up on the next menu message, which
    // always carries the current layout.
    if(!isPrivate||forget||sentMenu)return false;
    try {
      const profile=await profiles.get(chatId);
      const expected=menuVersion(profile.language||"en",profile.role);
      if(profile.menuVersion===expected)return false;
      if(profile.panelMessageId&&typeof removeMessage==="function"){
        try {await removeMessage(chatId,profile.panelMessageId);}
        catch { /* The panel may already be gone or too old to delete. */ }
      }
      await mutateProfile(profiles,chatId,p=>{
        p.menuVersion=expected;
        p.panelMessageId=null;
        return p;
      });
    } catch { /* Best-effort: never let bookkeeping break the action. */ }
    return false;
  };
  return {trackedSendMenu,syncIfNeeded};
}
