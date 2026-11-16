/* OCI private state. Profile format is shared with the interactive-menu PR. */
import { existsSync,readFileSync,writeFileSync,renameSync } from "node:fs";
import { join } from "node:path";
const CODE=/^[A-Z0-9]{6}$/;
export function makeNodeNotifyState(dataDir) {
  const filename=join(dataDir,"notification-state.json");
  let saved=existsSync(filename)?JSON.parse(readFileSync(filename,"utf8")):
    {baseline:null,sent:[]};
  if(!saved||typeof saved!=="object"||
     (saved.baseline!==null&&!Array.isArray(saved.baseline))||
     !Array.isArray(saved.sent))throw Error("Corrupt Telegram notification state");
  const sent=new Set(saved.sent);
  const save=()=>{
    const tmp=filename+".tmp";
    writeFileSync(tmp,JSON.stringify({baseline:saved.baseline,sent:[...sent]}),{mode:0o600});
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
    async wasSent(id,code){return sent.has(id+":"+code);},
    async markSent(id,code) {
      if(!CODE.test(code))throw Error("Bad delivered code");
      sent.add(id+":"+code);save();
    }
  };
}
