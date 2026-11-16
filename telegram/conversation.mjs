import { CODE_PATTERN, formatCodeStatus } from "./bot.mjs";
import { codeButtons, codeDescription } from "./menu.mjs";
import { mutateProfile } from "./profiles.mjs";
import { LOCALES, LOCALE_NAMES, menuText, tr } from "./i18n.mjs";

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
  if(profile.pending.type==="status")return {...action,type:"status",code};
  if(profile.pending.type==="report")return {...action,type:"report-choose",code};
  return {...action,type:"usage-menu"};
}

export async function handleInteractive({action,profiles,send,sendMenu,services,githubToken}) {
  const {type,chatId,code}=action;
  const profile=await profiles.get(chatId);
  const language=profile.language||"en";
  const msg=(key,params)=>tr(language,key,params);
  const prompt=async(kind,key)=>{
    await mutateProfile(profiles,chatId,p=>{p.pending={type:kind,until:Date.now()+10*60*1000};return p;});
    return send(chatId,msg(key));
  };
  const languageButtons=()=>LOCALES.map(code=>
    [{text:(language===code?"✅ ":"")+LOCALE_NAMES[code],data:"t:lang:"+code}]);
  async function list(query="",newest=false,page=0) {
    // One concise message per page instead of five separate code cards.
    const needle=String(query||"").trim().slice(0,80);
    let current=Number.isSafeInteger(page)?Math.max(0,Math.min(99,page)):0;
    let found=await services.browseCodes({query:needle,newest,limit:6,offset:current*5});
    if(!Array.isArray(found))throw Error("Invalid catalog page");
    if(current>0&&!found.length) {
      current=0;
      found=await services.browseCodes({query:needle,newest,limit:6,offset:0});
    }
    await mutateProfile(profiles,chatId,p=>{
      p.browse={query:needle,newest,page:current};
      p.pending=null; // Stop old submit/report prompts before navigating.
      return p;
    });
    const buttons=[];
    if(!found.length) {
      return send(chatId,msg(needle?"emptySearch":"emptyCodes"),[
        [{text:msg("backMenu"),data:"t:home"}]
      ]);
    }
    const visible=found.slice(0,5);
    for(const entry of visible)buttons.push([
      {text:"🎟 "+entry.code,data:"t:detail:"+entry.code}
    ]);
    const nav=[];
    if(current>0)nav.push({text:msg("previous"),data:"t:page:"+(current-1)});
    if(found.length>5&&current<99)nav.push({text:msg("next"),data:"t:page:"+(current+1)});
    if(nav.length)buttons.push(nav);
    buttons.push([
      {text:menuText(language,"refresh"),data:"t:refresh"},
      {text:msg("backMenu"),data:"t:home"}
    ]);
    const heading=msg(needle?"searchHeading":newest?"newestHeading":"browseHeading");
    const rows=visible.map(e=>"• "+e.code+" — "+
      (Number.isSafeInteger(e.remaining)&&e.usageReportedAt
        ? msg("cardRemaining",{count:e.remaining,date:e.usageReportedAt})
        : msg("cardUnknown")));
    return send(chatId,[heading,msg("pageTitle",{page:current+1}),msg("chooseCode"),...rows].join("\n"),buttons);
  }
  switch(type) {
    case "help":
      await sendMenu(chatId,profile.role
        ? msg(profile.role==="seeker"?"roleSeekerWelcome":"roleContributorWelcome")
        : msg("roleIntro"),language,profile.role);
      return true;
    case "choose-role":
      await sendMenu(chatId,msg("roleChoiceTitle"),language,null);
      return true;
    case "set-role-seeker":
    case "set-role-contributor": {
      const role=type==="set-role-seeker"?"seeker":"contributor";
      await mutateProfile(profiles,chatId,p=>{
        p.role=role;
        p.pending=null; // Switching menus must not accidentally complete an earlier submission.
        return p;
      });
      await sendMenu(chatId,msg(role==="seeker"?"roleSeekerWelcome":"roleContributorWelcome"),language,role);
      return true;
    }
    case "need-code":
      await send(chatId,msg("needTitle")+"\n\n"+msg("needDetails"),[
        [{text:msg("needBrowse"),data:"t:need:browse"}],
        [{text:msg("needNotify"),data:"t:need:alerts"}],
        [{text:msg("needSearch"),data:"t:need:search"}]
      ]);
      return true;
    case "browse": await list();return true;
    case "newest": await list("",true);return true;
    case "refresh": await list("",true);return true;
    case "page": {
      const context=profile.browse||{query:"",newest:true,page:0};
      await list(context.query,context.newest,action.page);
      return true;
    }
    case "back-list": {
      const context=profile.browse||{query:"",newest:true,page:0};
      await list(context.query,context.newest,context.page);
      return true;
    }
    case "home":
      if(profile.pending)await mutateProfile(profiles,chatId,p=>{p.pending=null;return p;});
      await sendMenu(chatId,profile.role
        ? msg(profile.role==="seeker"?"roleSeekerWelcome":"roleContributorWelcome")
        : msg("roleIntro"),language,profile.role);
      return true;
    case "prompt-search": await prompt("search","promptSearch");return true;
    case "prompt-submit": await prompt("submit","promptSubmit");return true;
    case "prompt-report": await prompt("report","promptReport");return true;
    case "prompt-status": await prompt("status","statusPrompt");return true;
    case "search": await list(action.query);return true;
    case "detail":
    case "refresh-code":
    case "get": {
      const entries=await services.browseCodes({query:code,limit:50});
      const entry=entries.find(x=>x.code===code);
      if(entry)await send(chatId,codeDescription(entry,language),codeButtons(code,language));
      else await send(chatId,formatCodeStatus(code,await services.getCodeStatus(code,githubToken),language),[
        [{text:msg("backList"),data:"t:back-list"},
         {text:msg("backMenu"),data:"t:home"}]
      ]);
      return true;
    }
    case "report-choose":
      await send(chatId,msg("reportChoose",{code}),[
        [{text:msg("worked"),data:"t:pick:"+code+":worked"},
         {text:msg("failed"),data:"t:pick:"+code+":failed"}],
        [{text:msg("cancel"),data:"t:cancel"}]
      ]);
      return true;
    case "usage-menu":
      await sendMenu(chatId,msg(profile.role?"usageMenu":"roleIntro"),language,profile.role);
      return true;
    case "invalid-input":
      await send(chatId,msg("invalidInput"));
      return true;
    case "my-codes": {
      const rows=profile.submitted;
      if(!rows.length)await send(chatId,msg("mineEmpty"));
      else await send(chatId,msg("mineTitle")+"\n"+
        rows.map(x=>"• "+x.code+" — "+x.url).join("\n")+"\n"+msg("mineFooter"));
      return true;
    }
    case "notifications":
    case "settings": {
      await send(chatId,msg(type==="settings"?"settingsTitle":"notificationsTitle")+
        "\n"+msg("alertsLabel")+" "+msg(profile.subscribed?"alertsOn":"alertsOff")+
        "\n"+msg("watchedCount")+" "+profile.watching.length+
        "\n"+msg("roleCurrent")+" "+msg(profile.role==="seeker"?"roleSeekerName":
          profile.role==="contributor"?"roleContributorName":"roleUnsetName")+
        "\n"+msg("alertsNote"),[
          [{text:msg(profile.subscribed?"disableAlerts":"enableAlerts"),data:"t:sub:"+(profile.subscribed?"off":"on")}],
          [{text:msg("watchedButton"),data:"t:watchlist"},
           {text:msg("languageButton")+" · "+LOCALE_NAMES[language],data:"t:langs"}],
          [{text:msg("roleChange"),data:"t:roles"}],
          [{text:msg("deleteData"),data:"t:erase:ask"}]
        ]);
      return true;
    }
    case "choose-language":
      await send(chatId,msg("languageTitle"),languageButtons());
      return true;
    case "set-language": {
      if(!LOCALES.includes(action.language))return true;
      await mutateProfile(profiles,chatId,p=>{
        p.language=action.language;p.languageManual=true;return p;
      });
      await sendMenu(chatId,tr(action.language,"languageChanged"),action.language,profile.role);
      return true;
    }
    case "subscribe":
    case "unsubscribe": {
      const p=await mutateProfile(profiles,chatId,p=>{p.subscribed=type==="subscribe";return p;});
      await send(chatId,msg(p.subscribed?"subscribed":"unsubscribed"));
      return true;
    }
    case "watchlist": {
      await send(chatId,profile.watching.length
        ? msg("watchlistTitle")+"\n"+profile.watching.map(x=>"• "+x).join("\n")+"\n"+msg("watchlistFooter")
        : msg("watchlistEmpty"));
      return true;
    }
    case "watch": {
      const entry=await services.getCodeStatus(code,githubToken);
      if(!["listed","pending"].includes(entry.kind)){
        await send(chatId,msg("watchDenied")+"\n"+entry.url);
        return true;
      }
      const p=await mutateProfile(profiles,chatId,p=>{
        if(!p.watching.includes(code))p.watching=[...p.watching,code].slice(-50);
        return p;
      });
      await send(chatId,msg("watching",{code,count:p.watching.length}));
      return true;
    }
    case "unwatch": {
      await mutateProfile(profiles,chatId,p=>{p.watching=p.watching.filter(x=>x!==code);return p;});
      await send(chatId,msg("unwatched",{code}));
      return true;
    }
    case "delete-data":
      await send(chatId,msg("deletePrompt"),[
        [{text:msg("confirmDelete"),data:"t:erase:confirm"},{text:msg("cancel"),data:"t:cancel"}]
      ]);
      return true;
    case "delete-confirm":
      await profiles.delete(chatId);
      await sendMenu(chatId,msg("deleted"),language,null);
      return true;
    default:return false;
  }
}
