// Shared anti-spam budgets for both OCI (disk) and Cloudflare Workers (KV).
// Keep these records private; Telegram numeric chat/update identifiers must never be public.
export const WRITE_HOUR_MS = 60 * 60 * 1000;
export const WRITE_DAY_MS = 24 * WRITE_HOUR_MS;
export const WRITE_LIMITS = Object.freeze({
  chatHourly: 8,      // Submit + report combined
  chatDaily: 12,      // Throttle repeated reports over a day
  newCodesDaily: 3,   // Per chat: independent new-code submissions
  globalNewHourly: 20,
  globalNewDaily: 80
});
const MAX_EVENTS = 120;

export function recentWriteEvents(value, now=Date.now()) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw Error("Invalid private rate-limit state");
  if (!Number.isFinite(now)) throw Error("Invalid rate-limit clock");
  return value.map(row=>{
    // Migrate existing Workers' 8-per-hour timestamps without resetting quota.
    if (Number.isSafeInteger(row) && row >= 0)
      return {at:row,kind:"legacy",updateId:null};
    if (!row || !Number.isSafeInteger(row.at) || row.at<0 ||
        !["submit","report","legacy"].includes(row.kind) ||
        (row.updateId!==null && (!Number.isSafeInteger(row.updateId)||row.updateId<0)))
      throw Error("Invalid private rate-limit entry");
    return {at:row.at,kind:row.kind,updateId:row.updateId};
  }).filter(row=>row.at<=now && now-row.at<WRITE_DAY_MS).slice(-MAX_EVENTS);
}

export function writeDecision(previous,{kind,updateId,scope="chat",now=Date.now()}){
  if (!["submit","report"].includes(kind) ||
      !Number.isSafeInteger(updateId) || updateId<0 ||
      !["chat","global"].includes(scope))
    throw Error("Invalid write-rate request");
  const history=recentWriteEvents(previous,now);
  if(history.some(row=>row.updateId===updateId && row.kind===kind))
    return {allowed:true,retry:true,history};

  const withinHour=history.filter(row=>now-row.at<WRITE_HOUR_MS);
  if(scope==="chat"){
    if(withinHour.length>=WRITE_LIMITS.chatHourly ||
       history.length>=WRITE_LIMITS.chatDaily ||
       (kind==="submit" &&
        history.filter(row=>row.kind==="submit").length>=WRITE_LIMITS.newCodesDaily))
      return {allowed:false,retry:false,history};
  }else if(kind==="submit"){
    if(withinHour.length>=WRITE_LIMITS.globalNewHourly ||
       history.length>=WRITE_LIMITS.globalNewDaily)
      return {allowed:false,retry:false,history};
  }
  return {allowed:true,retry:false,
    history:[...history,{at:now,kind,updateId}].slice(-MAX_EVENTS)};
}
