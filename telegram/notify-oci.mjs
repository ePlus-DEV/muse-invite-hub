/* OCI private state. Profile format is shared with the interactive-menu PR. */
import { existsSync,readFileSync,writeFileSync,renameSync } from "node:fs";
import { join } from "node:path";
const CODE=/^[A-Z0-9]{6}$/;
export function makeNodeNotifyState(dataDir) {
  const filename=join(dataDir,"notification-state.json");
  let saved=existsSync(filename)?JSON.parse(readFileSync(filename,"utf8")):
    {baseline:null,sent:[],digest:{}};
  if(!saved||typeof saved!=="object"||
     (saved.baseline!==null&&!Array.isArray(saved.baseline))||
     !Array.isArray(saved.sent))throw Error("Corrupt Telegram notification state");
  const sent=new Set(saved.sent);
  const digest=saved.digest&&typeof saved.digest==="object"&&!Array.isArray(saved.digest)
    ? saved.digest:{};
  // Old data files without a digest are migrated transparently. Invalid or
  // stale per-chat entries are ignored and never exposed in public catalog.
  for(const [id,value] of Object.entries(digest)){
    if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))||
       !Number.isSafeInteger(value?.messageId)||value.messageId<=0||
       !Number.isSafeInteger(value?.at)||value.at<=0||
       !Array.isArray(value.codes)||value.codes.length>25||
       value.codes.some(code=>!CODE.test(code))){
      delete digest[id];
    }
  }
  const save=()=>{
    const tmp=filename+".tmp";
    writeFileSync(tmp,JSON.stringify({baseline:saved.baseline,sent:[...sent],digest}),{mode:0o600});
    renameSync(tmp,filename);
  };
  return {
    async getBaseline(){return saved.baseline;},
    async setBaseline(codes){saved.baseline=[...codes];save();},
    async listProfiles(cursor,limit) {
      const path=join(dataDir,"private-profiles.json");
      const data=existsSync(path)?JSON.parse(readFileSync(path,"utf8")):{};
      if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Invalid profiles file");
      const ids=Object.keys(data).filter(v=>/^-?\d{1,18}$/.test(v)).sort();
      if(cursor&&!/^\d{1,10}$/.test(cursor))throw Error("Invalid notification cursor");
      const offset=Number(cursor||0);
      if(offset>ids.length)throw Error("Notification cursor out of range");
      const selected=ids.slice(offset,offset+limit).map(id=>({chatId:Number(id),profile:data[id]}))
        .filter(x=>Number.isSafeInteger(x.chatId)&&x.chatId>0);
      return {profiles:selected,cursor:offset+limit<ids.length?String(offset+limit):null};
    },
    async getDigest(id){return digest[String(id)]||null;},
    async setDigest(id,value){
      digest[String(id)]=value;
      // Bound private file size. Old messages can no longer be edited anyway.
      for(const [key,item] of Object.entries(digest))
        if(Date.now()-item.at>3600000)delete digest[key];
      save();
    },
    async wasSent(id,code){return sent.has(id+":"+code);},
    async markSent(id,code) {
      if(!CODE.test(code))throw Error("Bad delivered code");
      sent.add(id+":"+code);save();
    }
  };
}
