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
    async wasSent(id,code){return await kv.get("notify:sent:"+id+":"+code)!==null;},
    async markSent(id,code){await kv.put("notify:sent:"+id+":"+code,"1");}
  };
}
