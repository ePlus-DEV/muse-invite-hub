import { CODE_PATTERN, formatCodeStatus } from "./bot.mjs";
import { REPLY_KEYBOARD, codeButtons, codeDescription } from "./menu.mjs";
import { mutateProfile } from "./profiles.mjs";

const SITE="https://muse.eplus.dev";
export async function resolveInput(action,profiles) {
  if(action.type!=="text")return action;
  const profile=await profiles.get(action.chatId);
  if(!profile.pending)return {...action,type:"usage-menu"};
  const text=action.text.trim();
  const code=text.toUpperCase();
  if(profile.pending.type==="search"){
    await mutateProfile(profiles,action.chatId,p=>{p.pending=null;return p;});
    return {...action,type:"search",query:text};
  }
  if(!CODE_PATTERN.test(code)){
    return {...action,type:"invalid-input",intent:profile.pending.type};
  }
  await mutateProfile(profiles,action.chatId,p=>{p.pending=null;return p;});
  if(profile.pending.type==="submit")return {...action,type:"confirm-submit",code};
  if(profile.pending.type==="report")return {...action,type:"report-choose",code};
  return {...action,type:"usage-menu"};
}

export async function handleInteractive({action,profiles,send,sendMenu,services,githubToken}) {
  const {type,chatId,code}=action;
  const prompt=async(kind,text)=>{
    await mutateProfile(profiles,chatId,p=>{p.pending={type:kind,until:Date.now()+10*60*1000};return p;});
    return send(chatId,text);
  };
  async function list(query="",newest=false) {
    const entries=await services.browseCodes({query,newest,limit:5});
    if(!entries.length)return send(chatId,
      query?"No published invite matches your search. Try another code or use /submit CODE.":
        "No published codes are available. Visit "+SITE+"/#codes");
    await send(chatId,(query?"Search results":newest?"Recently published codes":"Published community codes")+
      " (not live or Muse-verified):");
    for(const entry of entries)await send(chatId,codeDescription(entry),codeButtons(entry.code));
  }
  switch(type) {
    case "help":
      await sendMenu(chatId,[
        "✦ Muse Invite Hub — Chào mừng!",
        "🎟 Find and copy community invite codes.",
        "➕ Contribute a public code and track its review.",
        "✅ Report only a code you really tried.",
        "🔔 Opt in to publication alerts.",
        "",
        "Use the nine buttons below, or /submit CODE, /get CODE, /search TEXT, /watch CODE.",
        "Published codes are not guaranteed to redeem. Never share secrets."
      ].join("\n"));
      return true;
    case "browse": await list();return true;
    case "newest": await list("",true);return true;
    case "prompt-search": await prompt("search","🔎 Enter a code or contributor name to search (within 10 minutes).");return true;
    case "prompt-submit": await prompt("submit","➕ Enter the SIX-character PUBLIC Muse invite code. You will review a confirmation before anything is posted to GitHub.");return true;
    case "prompt-report": await prompt("report","✅ Enter the SIX-character published code you tried. Then select Worked or Failed and confirm.");return true;
    case "search": await list(action.query);return true;
    case "get": {
      const entries=await services.browseCodes({query:code,limit:50});
      const entry=entries.find(x=>x.code===code);
      if(entry)await send(chatId,codeDescription(entry),codeButtons(code));
      else await send(chatId,formatCodeStatus(code,await services.getCodeStatus(code,githubToken)));
      return true;
    }
    case "report-choose":
      await send(chatId,"Code "+code+" — choose what actually happened. You must confirm before a public GitHub comment is created.",[
        [{text:"✅ Worked",data:"t:pick:"+code+":worked"},
         {text:"❌ Failed",data:"t:pick:"+code+":failed"}],
        [{text:"Cancel",data:"t:cancel"}]
      ]);
      return true;
    case "usage-menu":
      await sendMenu(chatId,"Choose one of the nine menu buttons below. Use /help to see the guide.");
      return true;
    case "invalid-input":
      await send(chatId,"A Muse invite code must contain exactly 6 letters or digits (A–Z, 0–9). Send another code or /cancel.");
      return true;
    case "my-codes": {
      const p=await profiles.get(chatId);
      const rows=p.submitted;
      if(!rows.length)await send(chatId,"No Telegram submissions are saved for this chat. Use ➕ Đóng góp to share a public code.");
      else await send(chatId,"Your submissions from this chat (not proof of code ownership):\n"+
        rows.map(x=>"• "+x.code+" — "+x.url).join("\n")+
        "\nUse /status CODE to check published or pending review.");
      return true;
    }
    case "notifications":
    case "settings": {
      const p=await profiles.get(chatId);
      await send(chatId,(type==="settings"?"⚙️ Settings":"🔔 Publication notifications")+
        "\nNew-code alerts: "+(p.subscribed?"ON":"OFF")+
        "\nWatched codes: "+p.watching.length+
        "\nAlerts require the notification delivery service to be deployed. You control this preference.",[
          [{text:p.subscribed?"🔕 Disable new-code alerts":"🔔 Enable new-code alerts",data:"t:sub:"+(p.subscribed?"off":"on")}],
          [{text:"📌 Watched codes",data:"t:watchlist"},
           {text:"🗑 Delete my bot data",data:"t:erase:ask"}]
        ]);
      return true;
    }
    case "subscribe":
    case "unsubscribe": {
      const p=await mutateProfile(profiles,chatId,p=>{p.subscribed=type==="subscribe";return p;});
      await send(chatId,p.subscribed?"New-code alerts enabled. Use /unsubscribe to stop.":"New-code alerts disabled. Use /subscribe to enable.");
      return true;
    }
    case "watchlist": {
      const p=await profiles.get(chatId);
      await send(chatId,p.watching.length?"📌 Watched codes:\n"+p.watching.map(x=>"• "+x).join("\n")+
        "\nUse /unwatch CODE to remove one.":"Your watchlist is empty. Use /watch CODE or 📌 Watch under any listed code.");
      return true;
    }
    case "watch": {
      const entry=await services.getCodeStatus(code,githubToken);
      if(!["listed","pending"].includes(entry.kind)){
        await send(chatId,"Only published or currently pending codes can be watched.\n"+entry.url);
        return true;
      }
      const p=await mutateProfile(profiles,chatId,p=>{
        if(!p.watching.includes(code))p.watching=[...p.watching,code].slice(-50);
        return p;
      });
      await send(chatId,"📌 Watching "+code+" ("+p.watching.length+" tracked). Use /unwatch "+code+" to stop. Publishing is not Muse verification.");
      return true;
    }
    case "unwatch": {
      await mutateProfile(profiles,chatId,p=>{p.watching=p.watching.filter(x=>x!==code);return p;});
      await send(chatId,"Stopped watching "+code+".");
      return true;
    }
    case "delete-data":
      await send(chatId,"Delete your private bot preferences, watchlist and this chat's submission history? "+
        "This will NOT delete public GitHub Issues or comments already created.",[
        [{text:"🗑 Confirm delete",data:"t:erase:confirm"},{text:"Cancel",data:"t:cancel"}]
      ]);
      return true;
    case "delete-confirm":
      await profiles.delete(chatId);
      await sendMenu(chatId,"Your private bot preferences and submission history were deleted. Public GitHub posts remain.");
      return true;
    default:return false;
  }
}
