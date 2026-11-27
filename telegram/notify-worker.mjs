import { isNotificationKey } from "./notifications.mjs";
/* Worker KV notifications: private, paginated, per-recipient delivery markers.
 * Pages concurrency is serialized; KV has eventual consistency, so in rare
 * failures delivery is at-least-once. Never claim strong exactly-once semantics.
 */
export function makeWorkerNotifyState(kv) {
  return {
    async getBaseline(){
      const value=await kv.get("notify:baseline");
      return value===null?null:JSON.parse(value);
    },
    async setBaseline(codes){await kv.put("notify:baseline",JSON.stringify(codes));},
    async listProfiles(cursor,limit){
      const page=await kv.list({prefix:"profile:",limit,cursor});
      const profiles=[];
      for(const item of page.keys) {
        const id=item.name.slice("profile:".length);
        if(!/^\d{1,18}$/.test(id)||!Number.isSafeInteger(Number(id)))continue;
        const raw=await kv.get(item.name);
        if(!raw)continue;
        profiles.push({chatId:Number(id),profile:JSON.parse(raw)});
      }
      return {profiles,cursor:page.list_complete?null:page.cursor};
    },
    async getDigest(id){
      const raw=await kv.get("notify:digest:"+id);
      if(!raw)return null;
      try {
        const value=JSON.parse(raw);
        return Number.isSafeInteger(value.messageId)&&value.messageId>0&&
          Number.isSafeInteger(value.at)&&value.at>0&&
          Array.isArray(value.codes)&&value.codes.length<=25&&
          value.codes.every(isNotificationKey)
          ? value:null;
      } catch {return null;}
    },
    async setDigest(id,digest){
      await kv.put("notify:digest:"+id,JSON.stringify(digest),{
        expirationTtl:3600
      });
    },
    async wasSent(id,code){return await kv.get("notify:sent:"+id+":"+code)!==null;},
    async markSent(id,code){await kv.put("notify:sent:"+id+":"+code,"1");}
  };
}
