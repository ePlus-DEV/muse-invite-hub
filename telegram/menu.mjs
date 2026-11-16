/* Telegram reply keyboard is an interface, not a Muse availability claim. */
export const MENU = Object.freeze([
  ["🎟 Nhận mã", "🆕 Mã mới", "🔎 Tìm mã"],
  ["➕ Đóng góp", "📋 Mã của tôi", "✅ Báo cáo"],
  ["🔔 Thông báo", "📌 Theo dõi", "⚙️ Cài đặt"]
]);
export const REPLY_KEYBOARD = {
  keyboard: MENU,
  resize_keyboard: true,
  is_persistent: true,
  one_time_keyboard: false,
  input_field_placeholder: "Chọn chức năng hoặc nhập mã..."
};
const actions = new Map([
  ["🎟 Nhận mã","browse"], ["🆕 Mã mới","newest"],
  ["🔎 Tìm mã","prompt-search"], ["➕ Đóng góp","prompt-submit"],
  ["📋 Mã của tôi","my-codes"], ["✅ Báo cáo","prompt-report"],
  ["🔔 Thông báo","notifications"], ["📌 Theo dõi","watchlist"],
  ["⚙️ Cài đặt","settings"]
]);
export function menuChoice(text) { return actions.get(text) || null; }
export function codeButtons(code) {
  return [
    [{text:"📋 Copy "+code,copy_text:{text:code}},
     {text:"🔗 Details",url:"https://muse.eplus.dev/codes/"+code+"/"}],
    [{text:"📌 Watch",data:"t:watch:"+code},
     {text:"✅ Worked",data:"t:pick:"+code+":worked"},
     {text:"❌ Failed",data:"t:pick:"+code+":failed"}]
  ];
}
export function codeDescription(entry) {
  const code=entry.code;
  if(!/^[A-Z0-9]{6}$/.test(code))throw Error("Invalid published code");
  const rawStatus=entry.status==="reported-working"?"Community-reported working":
    entry.status==="reported-not-working"?"Community-reported not working":
    "Unverified";
  const count=entry.remaining===null||entry.remaining===undefined ? "Not reported":
    "Reported "+entry.remaining+" remaining (as of "+entry.usageReportedAt+"; not live)";
  return "🎟 "+code+"\n"+rawStatus+" · Not Muse-verified\nRemaining invites: "+count+
    "\nCopying does not redeem a code.";
}
