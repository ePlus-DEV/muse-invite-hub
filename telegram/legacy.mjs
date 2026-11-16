/* Shared localized command responses for OCI and Cloudflare Workers.
 * Commands and callback values remain stable; public GitHub writes still need consent.
 */
import { formatCodeStatus } from "./bot.mjs";
import { mutateProfile } from "./profiles.mjs";
import { tr } from "./i18n.mjs";

const SITE="https://muse.eplus.dev";
const ISSUE=/^https:\/\/github\.com\/ePlus-DEV\/muse-invite-hub\/issues\/[1-9]\d*$/;

export async function handleLegacy({action,profiles,send,complete,services,githubToken,allowWrite}) {
  const {chatId,type,code,result,updateId}=action;
  const language=(await profiles.get(chatId)).language||"en";
  const msg=(key,params)=>tr(language,key,params);
  switch(type) {
    case "private-only":
      return send(chatId,msg("privateOnly"));
    case "codes": {
      const latest=await services.listRecentCodes();
      return send(chatId,latest.length
        ? msg("browseHeading")+"\n"+latest.map(x=>"• "+x).join("\n")
        : msg("emptyCodes"),[[{text:msg("browseAll"),url:SITE+"/#codes"}]]);
    }
    case "status": {
      const entry=await services.getCodeStatus(code,githubToken);
      return send(chatId,formatCodeStatus(code,entry,language),[
        [{text:msg("openDirectory"),url:SITE+"/#codes"}]
      ]);
    }
    case "usage-code":return send(chatId,msg("usageCode"));
    case "usage-status":return send(chatId,msg("usageStatus"));
    case "privacy":return send(chatId,msg("privacy"));
    case "count":return send(chatId,msg("count"),[
      [{text:msg("openDirectory"),url:SITE+"/#codes"}]
    ]);
    case "usage-submit":return send(chatId,msg("usageSubmit"));
    case "usage-report":return send(chatId,msg("usageReport"));
    case "confirm-submit":
      return send(chatId,msg("confirmSubmit",{code}),[
        [{text:msg("confirmSubmission"),data:"t:submit:"+code}],
        [{text:msg("cancel"),data:"t:cancel"}]
      ]);
    case "confirm-report":
      return send(chatId,msg("confirmReport",{
        code,outcome:msg(result==="worked"?"worked":"failed")
      }),[
        [{text:msg("confirmReport"),data:"t:report:"+code+":"+result}],
        [{text:msg("cancel"),data:"t:cancel"}]
      ]);
    case "cancel":return complete(msg("cancelled"));
    case "submit": {
      if(!await allowWrite(chatId))return complete(msg("rateSubmit"));
      const outcome=await services.submitNewCode(code,updateId,githubToken);
      if(outcome.kind==="submitted"&&ISSUE.test(outcome.url||"")){
        await mutateProfile(profiles,chatId,p=>{
          if(!p.submitted.some(x=>x.code===code))p.submitted.push({code,url:outcome.url});
          p.submitted=p.submitted.slice(-50);
          return p;
        });
      }
      const key={
        listed:"submitListed",pending:"submitPending",submitted:"submitSubmitted"
      }[outcome.kind]||"submitOther";
      return complete(msg(key)+"\n"+outcome.url);
    }
    case "report": {
      if(!await allowWrite(chatId))return complete(msg("rateReport"));
      const outcome=await services.submitFeedback(code,result,updateId,githubToken);
      const key={
        unknown:"reportUnknown",unmapped:"reportUnmapped",
        "already-reported":"reportDuplicate",reported:"reportSubmitted"
      }[outcome.kind]||"reportOther";
      return complete(msg(key)+"\n"+outcome.url);
    }
  }
}
