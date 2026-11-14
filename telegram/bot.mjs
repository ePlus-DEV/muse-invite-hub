/* Telegram update parser. No GitHub credentials or public identity attribution. */
export const CODE_PATTERN = /^[A-Z0-9-]{4,32}$/;

export function parseCommand(text) {
  if (typeof text !== "string" || text.length > 300) return {type:"help"};
  const parts=text.trim().split(/\s+/);
  const command=(parts[0]||"").toLowerCase().replace(/@[a-z0-9_]+$/i,"");
  if (command==="/start"||command==="/help") return {type:"help"};
  if (command==="/codes") return {type:"codes"};
  if (command==="/count") return {type:"count",code:parts[1]?.toUpperCase()||""};
  if (command==="/submit") {
    const code=parts[1]?.toUpperCase()||"";
    return parts.length===2&&CODE_PATTERN.test(code) ? {type:"confirm-submit",code} : {type:"usage-submit"};
  }
  if (command==="/report") {
    const code=parts[1]?.toUpperCase()||"";
    const result=parts[2]?.toLowerCase();
    return parts.length===3&&CODE_PATTERN.test(code)&&["worked","failed"].includes(result)
      ? {type:"confirm-report",code,result}
      : {type:"usage-report"};
  }
  return {type:"help"};
}

export function parseUpdate(update) {
  if (!Number.isSafeInteger(update?.update_id)||update.update_id<0) return null;
  if (update.message && !update.message.from?.is_bot) {
    const message=update.message;
    const chat=message.chat;
    if (!Number.isSafeInteger(chat?.id)) return null;
    if (chat.type!=="private") return {type:"private-only",chatId:chat.id,updateId:update.update_id};
    return {...parseCommand(message.text),chatId:chat.id,updateId:update.update_id};
  }
  const callback=update.callback_query;
  if (!callback || typeof callback.id!=="string" ||
      !Number.isSafeInteger(callback.from?.id) ||
      callback.message?.chat?.type!=="private" ||
      callback.message.chat.id!==callback.from.id) return null;
  const data=callback.data||"";
  const matchSubmit=/^t:submit:([A-Z0-9-]{4,32})$/.exec(data);
  const matchReport=/^t:report:([A-Z0-9-]{4,32}):(worked|failed)$/.exec(data);
  return {
    type:matchSubmit?"submit":matchReport?"report":"cancel",
    code:matchSubmit?.[1]||matchReport?.[1],
    result:matchReport?.[2],
    chatId:callback.from.id,
    callbackId:callback.id,
    updateId:update.update_id
  };
}
export function keyboard(buttons) {
  return {inline_keyboard:buttons.map(row=>row.map(button=>({
    text:button.text,url:button.url,callback_data:button.data
  })).map(button=>Object.fromEntries(Object.entries(button).filter(([,value])=>value!==undefined))))};
}
