import { CODE_PATTERN, formatCodeStatus } from "./bot.mjs";
import { codeButtons, codeDescription } from "./menu.mjs";
import { mutateProfile } from "./profiles.mjs";
import { LOCALES, LOCALE_NAMES, menuText, tr } from "./i18n.mjs";

const SITE="https://muse.eplus.dev";
export async function resolveInput(action,profiles) {
  if(action.type!=="text")return action;
  const profile=await profiles.get(action.chatId);
  if(!profile.pending){
    // Pasting an invite code is the most common free-text input: open its
    // detail (or status) panel instead of bouncing to the usage menu.
    const pasted=action.text.trim().toUpperCase();
    if(CODE_PATTERN.test(pasted))return {...action,type:"detail",code:pasted};
    return {...action,type:"usage-menu"};
  }
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

export async function handleInteractive({action,profiles,send,sendMenu,edit,removeMessage,acknowledge,services,githubToken}) {
  const {type,chatId,code}=action;
  const profile=await profiles.get(chatId);
  const language=profile.language||"en";
  const msg=(key,params)=>tr(language,key,params);
  // Read-only inline navigation updates the existing message rather than
  // flooding the chat with duplicate cards on unchanged Refresh presses.
  const isRefreshCallback=Boolean(action.callbackId &&
    (type==="refresh" || type==="refresh-code"));
  const feedback=async key=>{
    if(isRefreshCallback&&typeof acknowledge==="function"){
      try {await acknowledge(msg(key));}
      catch { /* Expired callbacks must not create a chat message. */ }
    }
  };
  const panel=async(text,buttons)=>{
    const stored=await profiles.get(chatId);
    // Only inline callbacks edit their OWN message. Every reply-keyboard,
    // slash-command or typed-input action creates a panel near the latest
    // user message. Editing a saved panel instead makes the response
    // appear far up the chat (particularly after new-code notifications).
    if(!action.callbackId){
      if(stored.panelMessageId && typeof removeMessage==="function"){
        try {await removeMessage(chatId,stored.panelMessageId);}
        catch { /* Old panel might be >48h old or already removed. */ }
      }
      if(stored.panelMessageId)
        await mutateProfile(profiles,chatId,p=>{p.panelMessageId=null;return p;});
    }
    const target=action.callbackId?action.messageId:null;
    if(target&&typeof edit==="function"){
      try {
        const result=await edit(chatId,target,text,buttons);
        if(stored.panelMessageId!==target)
          await mutateProfile(profiles,chatId,p=>{p.panelMessageId=target;return p;});
        await feedback("refreshDone");
        return result;
      } catch(error) {
        if(/message is not modified/i.test(String(error?.message||""))){
          await feedback("alreadyUpToDate");
          return;
        }
        if(isRefreshCallback){
          await feedback("refreshFailed");
          return; // Never create a second Refresh card.
        }
        // Deleted or expired callback panel: send a new nearby message.
      }
    }
    if(isRefreshCallback){await feedback("refreshFailed");return;}
    const sent=await send(chatId,text,buttons);
    if(Number.isSafeInteger(sent?.message_id)&&sent.message_id>0)
      await mutateProfile(profiles,chatId,p=>{p.panelMessageId=sent.message_id;return p;});
    return sent;
  };
  const prompt=async(kind,key)=>{
    await mutateProfile(profiles,chatId,p=>{p.pending={type:kind,until:Date.now()+10*60*1000};return p;});
    return panel(msg(key),[[{text:msg("backMenu"),data:"t:home"}]]);
  };
  const languageButtons=(locale=language)=>LOCALES.map(code=>
    [{text:(locale===code?"✅ ":"")+LOCALE_NAMES[code],data:"t:lang:"+code}]);
  const settingsPanel=async(locale=language)=>{
    const current=await profiles.get(chatId);
    const trn=(key,params)=>tr(locale,key,params);
    return panel(trn("settingsTitle")+
      "\n"+trn("alertsLabel")+" "+trn(current.subscribed?"alertsOn":"alertsOff")+
      "\n"+trn("watchedCount")+" "+current.watching.length+
      "\n"+trn("roleCurrent")+" "+trn(current.role==="seeker"?"roleSeekerName":
        current.role==="contributor"?"roleContributorName":"roleUnsetName")+
      "\n"+trn("alertsNote"),[
        [{text:trn(current.subscribed?"disableAlerts":"enableAlerts"),
          data:"t:sub:"+(current.subscribed?"off":"on")}],
        [{text:trn("watchedButton"),data:"t:watchlist"},
         {text:trn("languageButton")+" · "+LOCALE_NAMES[locale],data:"t:langs"}],
        [{text:trn("roleChange"),data:"t:roles"}],
        [{text:trn("deleteData"),data:"t:erase:ask"}],
        [{text:trn("backList"),data:"t:back-list"},
         {text:trn("backMenu"),data:"t:home"}]
      ]);
  };
  const watchlistPanel=async()=>{
    const current=await profiles.get(chatId);
    const text=current.watching.length
      ? msg("watchlistTitle")+"\n"+msg("watchlistFooter")
      : msg("watchlistEmpty");
    const rows=current.watching.map(code=>[
      {text:"🎟 "+code,data:"t:detail:"+code},
      {text:msg("unwatchButton"),data:"t:unwatch:"+code}
    ]);
    rows.push([{text:msg("settingsTitle"),data:"t:settings"},
      {text:msg("backMenu"),data:"t:home"}]);
    return panel(text,rows);
  };
  const homePanel=async()=>{
    const current=await profiles.get(chatId);
    const role=current.role;
    const actions=role==="contributor"
      ? [[{text:menuText(language,"submit"),data:"t:prompt-submit"},
          {text:menuText(language,"browse"),data:"t:browse"}],
         [{text:menuText(language,"mine"),data:"t:mine"},
          {text:menuText(language,"settings"),data:"t:settings"}]]
      : [[{text:menuText(language,"browse"),data:"t:browse"},
          {text:menuText(language,"newest"),data:"t:newest"}],
         [{text:menuText(language,"search"),data:"t:search"},
          {text:menuText(language,"settings"),data:"t:settings"}]];
    return panel(msg(role==="contributor"?"roleContributorWelcome":"roleSeekerWelcome"),actions);
  };
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
      return panel(msg(needle?"emptySearch":"emptyCodes"),[
        [{text:msg("backMenu"),data:"t:home"}]
      ]);
    }
    const visible=found.slice(0,5);
    for(const entry of visible)buttons.push([
      {text:"🎟 "+entry.code+" · "+
        (Number.isSafeInteger(entry.remaining)&&entry.usageReportedAt
          ? msg("listReportedCount",{count:entry.remaining})
          : entry.basis==="default" && entry.remaining===30
            ? msg("listDefaultCount")
            : msg("cardUnknown")),data:"t:detail:"+entry.code}
    ]);
    const nav=[];
    if(current>0)nav.push({text:msg("previous"),data:"t:page:"+(current-1)});
    if(found.length>5&&current<99)nav.push({text:msg("next"),data:"t:page:"+(current+1)});
    if(nav.length)buttons.push(nav);
    buttons.push([
      {text:menuText(language,"refresh"),data:"t:refresh"},
      {text:menuText(language,"settings"),data:"t:settings"},
      {text:msg("backMenu"),data:"t:home"}
    ]);
    const heading=msg(needle?"searchHeading":newest?"newestHeading":"browseHeading");
    // Do not repeat the five codes in both the message and inline buttons.
    return panel(["🎟 "+heading,"📄 "+msg("pageTitle",{page:current+1}),
      msg("chooseCode")].join("\n"),buttons);
  }
  switch(type) {
    case "help":
      await sendMenu(chatId,profile.role
        ? msg(profile.role==="seeker"?"roleSeekerWelcome":"roleContributorWelcome")
        : msg("roleIntro"),language,profile.role);
      return true;
    case "sync-menu":
      await sendMenu(chatId,msg("menuRefreshed"),language,profile.role);
      return true;
    case "choose-role":
      await panel(msg("roleChoiceTitle"),[
        [{text:menuText(language,"roleSeeker"),data:"t:role:seeker"}],
        [{text:menuText(language,"roleContributor"),data:"t:role:contributor"}],
        [{text:msg("backMenu"),data:"t:settings"}]
      ]);
      return true;
    case "set-role-seeker":
    case "set-role-contributor": {
      const role=type==="set-role-seeker"?"seeker":"contributor";
      await mutateProfile(profiles,chatId,p=>{
        p.role=role;
        p.pending=null; // Switching menus must not accidentally complete an earlier submission.
        return p;
      });
      // The tracked menu send below deletes the previous panel and clears
      // its pointer: the first panel of the new role appears below the new
      // keyboard instead of editing a card from the old session.
      await sendMenu(chatId,msg(role==="seeker"?"roleSeekerWelcome":"roleContributorWelcome"),language,role);
      // One tap on "I need a code" opens the published list immediately.
      // Keep the role keyboard, but do not require a second "Get codes" tap.
      if(role==="seeker")await list();
      return true;
    }
    case "need-code":
      // A seeker already chose this intent: show available listings, not a CTA menu.
      await list();
      return true;
    case "browse": await list();return true;
    case "newest": await list("",true);return true;
    case "refresh": {
      // Inline refresh keeps search, sort and current page. Legacy /refresh
      // still retrieves the newest listing when used from plain chat text.
      const context=action.callbackId?profile.browse:null;
      await list(context?.query||"",context?.newest??true,context?.page??0);
      return true;
    }
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
      if(action.callbackId)await homePanel();
      else await sendMenu(chatId,profile.role
        ? msg(profile.role==="seeker"?"roleSeekerWelcome":"roleContributorWelcome")
        : msg("roleIntro"),language,profile.role);
      return true;
    case "prompt-search": await prompt("search","promptSearch");return true;
    case "prompt-submit": await prompt("submit","promptSubmit");return true;
    case "prompt-report": await prompt("report","promptReport");return true;
    case "prompt-status": await prompt("status","statusPrompt");return true;
    case "search": await list(action.query);return true;
    case "status": {
      const entry=await services.getCodeStatus(code,githubToken);
      await panel(formatCodeStatus(code,entry,language),[
        [{text:msg("backList"),data:"t:back-list"},
         {text:msg("backMenu"),data:"t:home"}]
      ]);
      return true;
    }
    case "detail":
    case "refresh-code":
    case "get": {
      const entries=await services.browseCodes({query:code,limit:50});
      const entry=entries.find(x=>x.code===code);
      if(entry)await panel(codeDescription(entry,language),codeButtons(code,language));
      else await panel(formatCodeStatus(code,await services.getCodeStatus(code,githubToken),language),[
        [{text:msg("backList"),data:"t:back-list"},
         {text:msg("backMenu"),data:"t:home"}]
      ]);
      return true;
    }
    case "report-choose":
      await panel(msg("reportChoose",{code}),[
        [{text:msg("worked"),data:"t:pick:"+code+":worked"},
         {text:msg("failed"),data:"t:pick:"+code+":failed"}],
        [{text:msg("cancel"),data:"t:cancel"},
         {text:msg("backList"),data:"t:back-list"}]
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
      await panel(rows.length
        ? msg("mineTitle")+"\n"+rows.map(x=>"• "+x.code+" — "+x.url).join("\n")+"\n"+msg("mineFooter")
        : msg("mineEmpty"),[[{text:msg("backMenu"),data:"t:home"}]]);
      return true;
    }
    case "notifications":
    case "settings":
      await settingsPanel();
      return true;
    case "choose-language":
      await panel(msg("languageTitle"),[
        ...languageButtons(),
        [{text:msg("settingsTitle"),data:"t:settings"}]
      ]);
      return true;
    case "set-language": {
      if(!LOCALES.includes(action.language))return true;
      await mutateProfile(profiles,chatId,p=>{
        p.language=action.language;p.languageManual=true;return p;
      });
      await sendMenu(chatId,tr(action.language,"languageChanged"),action.language,profile.role);
      if(action.callbackId)await settingsPanel(action.language);
      return true;
    }
    case "subscribe":
    case "unsubscribe":
      await mutateProfile(profiles,chatId,p=>{p.subscribed=type==="subscribe";return p;});
      await settingsPanel();
      return true;
    case "watchlist":
      await watchlistPanel();
      return true;
    case "watch": {
      const entry=await services.getCodeStatus(code,githubToken);
      if(!["listed","pending"].includes(entry.kind)){
        await panel(msg("watchDenied")+"\n"+entry.url,[
          [{text:msg("backList"),data:"t:back-list"}]
        ]);
        return true;
      }
      const p=await mutateProfile(profiles,chatId,p=>{
        if(!p.watching.includes(code))p.watching=[...p.watching,code].slice(-50);
        return p;
      });
      const rows=await services.browseCodes({query:code,limit:50});
      const listing=rows.find(x=>x.code===code);
      await panel(msg("watching",{code,count:p.watching.length})+
        (listing?"\n\n"+codeDescription(listing,language):""),listing
        ? codeButtons(code,language)
        : [[{text:msg("watchedButton"),data:"t:watchlist"},
            {text:msg("backMenu"),data:"t:home"}]]);
      return true;
    }
    case "unwatch":
      await mutateProfile(profiles,chatId,p=>{p.watching=p.watching.filter(x=>x!==code);return p;});
      await watchlistPanel();
      return true;
    case "delete-data":
      await panel(msg("deletePrompt"),[
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
