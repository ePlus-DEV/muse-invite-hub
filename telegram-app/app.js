/* Muse Invite Hub Mini App.
 * Public, read-only catalog browsing runs on GitHub Pages. User actions needing
 * private state or public review go back to the Telegram bot via sendData.
 * No Telegram initData, secrets, identities or credentials are stored here.
 */
const CODE=/^[A-Z0-9]{6}$/;
export const PAGE_SIZE=5;
export function normalizeInviteCode(value) {
  const code=typeof value==="string"?value.trim().toUpperCase():"";
  return CODE.test(code)?code:"";
}
export function platformOf(item) {
  if(typeof item?.sourceUrl!=="string")return "GitHub";
  try{
    const host=new URL(item.sourceUrl).hostname.toLowerCase();
    if(["www.threads.net","threads.net","threads.com","www.threads.com"].includes(host))return "Threads";
    if(["x.com","www.x.com","twitter.com","www.twitter.com"].includes(host))return "X";
    if(["facebook.com","www.facebook.com","m.facebook.com"].includes(host))return "Facebook";
  }catch{}
  return "GitHub";
}
export function remainingOf(item) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(item?.usageReportedAt||""))return null;
  if(Number.isSafeInteger(item.reportedRemaining)&&item.reportedRemaining>=0)return item.reportedRemaining;
  if(Number.isSafeInteger(item.reportedCapacity)&&
    Number.isSafeInteger(item.reportedUses)&&item.reportedUses>=0&&
    item.reportedCapacity>=item.reportedUses)return item.reportedCapacity-item.reportedUses;
  return null;
}
export function pageCatalog(rows,{query="",page=0,sort="newest"}={}) {
  const needle=String(query).trim().toLowerCase().slice(0,80);
  const filtered=(Array.isArray(rows)?rows:[])
    .filter(row=>row&&CODE.test(row.code||"")&&(!needle||
      row.code.toLowerCase().includes(needle)||
      String(row.submittedBy||"").toLowerCase().includes(needle)))
    .sort((a,b)=>sort==="featured"
      ?Number(b.featured===true)-Number(a.featured===true)||
        String(b.addedAt||"").localeCompare(String(a.addedAt||""))
      :String(b.addedAt||"").localeCompare(String(a.addedAt||"")));
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const current=Math.min(pages-1,Math.max(0,Number.isSafeInteger(page)?page:0));
  return {entries:filtered.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE),
    page:current,pages,total:filtered.length,hasPrev:current>0,hasNext:current<pages-1};
}
export function buildBotPayload(action,{code,language,result}={}) {
  const value={v:1,action};
  if(["submit","get","watch","report"].includes(action)) {
    const valid=normalizeInviteCode(code);
    if(!valid)throw Error("Invalid invite code");
    value.code=valid;
  }
  if(action==="report"){
    if(!["worked","failed"].includes(result))throw Error("Invalid report result");
    value.result=result;
  }
  if(action==="language"){
    if(!["en","vi","ja"].includes(language))throw Error("Unsupported language");
    value.language=language;
  }
  if(!["submit","get","watch","report","my","notifications","settings","watchlist","language"].includes(action))
    throw Error("Unsupported Mini App action");
  return JSON.stringify(value);
}
const COPY={
  en:{
    home:"Home",codes:"Codes",share:"Share",settings:"Settings",back:"Back",
    eyebrow:"THE COMMUNITY INVITE DIRECTORY",hero:"A little code can open a big door.",
    heroNote:"Discover, copy and share public Muse invite codes with the community.",
    findCodes:"Browse codes",findSubtitle:"Find community invitations",shareCode:"Contribute code",
    shareSubtitle:"Submit a public code for review",myCodes:"My submissions",
    mySubtitle:"Check the codes you shared",updates:"Updates & alerts",
    updatesSubtitle:"Manage publication notices",how:"How it works",howSubtitle:"Community rules",
    langTitle:"Language",langHelp:"Choose the app language. Sync it to your bot chat below.",
    syncLang:"Apply language to Telegram bot",settingsChat:"Open bot preferences",
    titleCodes:"Browse invite codes",codesNote:"Community listings are not verified by Muse.",
    search:"Search code or contributor",latest:"Newest",featured:"Featured",
    refresh:"Refresh",prev:"Previous",next:"Next",page:"Page",of:"of",results:"codes",
    emptyTitle:"No codes found",emptyNote:"Try another search or refresh.",
    detail:"Invite details",platform:"Platform",source:"Source",contributor:"Contributor",added:"Added",
    remaining:"Reported remaining",notReported:"Not reported",notLive:"Not live",
    community:"Community listing",status:"Status",copy:"Copy code",copied:"Code copied!",
    openSite:"Open detail page",watch:"Watch",report:"Report usage",
    worked:"Worked",failed:"Didn't work",disclaimer:"Listed does not mean Muse verified this code or that it will redeem.",
    titleShare:"Share a public code",shareIntro:"Enter one six-character Muse invite code. A public GitHub Issue is created only after you confirm again in Telegram.",
    inputLabel:"Invite code",inputExample:"ABC123",continue:"Continue",invalid:"Enter exactly six letters or digits (A–Z, 0–9).",
    confirmTitle:"Continue in Telegram?",confirmShare:"Send {code} to the bot? You will still confirm public posting in the Telegram chat. Your Telegram identity will not be published.",
    confirmReport:"Report {code} as {result}? You will confirm again in Telegram before a public GitHub comment is posted.",
    cancel:"Cancel",confirm:"Continue to bot",standalone:"Open this app from the Telegram bot keyboard to complete this action.",
    titleHow:"How Muse Invite Hub works",how1:"Browse community-shared public codes and copy one to try on Muse.",
    how2:"Report only codes you really tested; reports are reviewed and never verify redemption automatically.",
    how3:"New codes go through a public GitHub Issue and human review before they appear in the catalog.",
    botOpens:"This opens your existing private bot chat for the action.",
    loading:"Loading community codes…",loadError:"Could not load the catalog. Try Refresh.",
    publicSource:"Community",listed:"Unverified",success:"Community-reported working",
    unsuccessful:"Community-reported not working",sendBot:"Continue in Telegram"
  },
  vi:{
    home:"Trang chủ",codes:"Mã mời",share:"Đóng góp",settings:"Cài đặt",back:"Quay lại",
    eyebrow:"DANH MỤC MÃ MỜI CỘNG ĐỒNG",hero:"Một mã mời, nhiều cơ hội mới.",
    heroNote:"Khám phá, sao chép và chia sẻ mã mời Muse công khai.",
    findCodes:"Xem mã mời",findSubtitle:"Tìm mã từ cộng đồng",shareCode:"Đóng góp mã",
    shareSubtitle:"Gửi mã công khai để xét duyệt",myCodes:"Mã của tôi",
    mySubtitle:"Kiểm tra mã đã gửi",updates:"Cập nhật & thông báo",
    updatesSubtitle:"Quản lý thông báo mã mới",how:"Cách hoạt động",howSubtitle:"Quy định cộng đồng",
    langTitle:"Ngôn ngữ",langHelp:"Chọn ngôn ngữ ứng dụng; có thể đồng bộ cho bot bên dưới.",
    syncLang:"Đồng bộ ngôn ngữ với bot",settingsChat:"Mở cài đặt bot",
    titleCodes:"Danh sách mã mời",codesNote:"Mã cộng đồng chưa được Muse xác minh.",
    search:"Tìm mã hoặc người đóng góp",latest:"Mới nhất",featured:"Nổi bật",
    refresh:"Làm mới",prev:"Trước",next:"Sau",page:"Trang",of:"/",results:"mã",
    emptyTitle:"Không tìm thấy mã",emptyNote:"Thử tìm kiếm khác hoặc làm mới.",
    detail:"Chi tiết mã mời",platform:"Nền tảng",source:"Nguồn",contributor:"Người chia sẻ",added:"Ngày thêm",
    remaining:"Lượt còn (được báo cáo)",notReported:"Chưa báo cáo",notLive:"Không trực tiếp",
    community:"Mã cộng đồng",status:"Trạng thái",copy:"Sao chép mã",copied:"Đã sao chép mã!",
    openSite:"Mở trang chi tiết",watch:"Theo dõi",report:"Báo cáo sử dụng",
    worked:"Dùng được",failed:"Không dùng được",disclaimer:"Mã được liệt kê không đồng nghĩa được Muse xác minh hoặc chắc chắn sử dụng được.",
    titleShare:"Chia sẻ mã công khai",shareIntro:"Nhập một mã Muse gồm 6 ký tự. Chỉ sau khi xác nhận lại trong Telegram, bot mới tạo GitHub Issue công khai.",
    inputLabel:"Mã mời",inputExample:"ABC123",continue:"Tiếp tục",invalid:"Nhập đúng 6 chữ cái hoặc chữ số (A–Z, 0–9).",
    confirmTitle:"Tiếp tục trong Telegram?",confirmShare:"Gửi {code} tới bot? Bạn vẫn phải xác nhận đăng công khai trong chat Telegram. Danh tính Telegram không được công bố.",
    confirmReport:"Báo cáo {code} là {result}? Bạn vẫn phải xác nhận trong Telegram trước khi tạo bình luận GitHub công khai.",
    cancel:"Hủy",confirm:"Tiếp tục với bot",standalone:"Hãy mở ứng dụng từ nút trong bot Telegram để hoàn tất thao tác.",
    titleHow:"Muse Invite Hub hoạt động thế nào",how1:"Xem và sao chép mã công khai do cộng đồng chia sẻ để thử trên Muse.",
    how2:"Chỉ báo cáo mã đã thực sự thử. Báo cáo phải được xét duyệt và không tự động xác minh.",
    how3:"Mã mới tạo GitHub Issue công khai và cần được duyệt trước khi xuất hiện trong danh mục.",
    botOpens:"Thao tác sẽ tiếp tục trong chat bot riêng tư.",
    loading:"Đang tải mã cộng đồng…",loadError:"Không tải được danh sách. Hãy làm mới.",
    publicSource:"Cộng đồng",listed:"Chưa xác minh",success:"Cộng đồng báo dùng được",
    unsuccessful:"Cộng đồng báo không dùng được",sendBot:"Tiếp tục trong Telegram"
  },
  ja:{
    home:"ホーム",codes:"コード",share:"投稿",settings:"設定",back:"戻る",
    eyebrow:"コミュニティ招待コード一覧",hero:"一つのコードから、新しい可能性へ。",
    heroNote:"公開Muse招待コードを探して、コピーして、共有しましょう。",
    findCodes:"コードを見る",findSubtitle:"コミュニティの招待コード",shareCode:"コード投稿",
    shareSubtitle:"審査用に公開コードを投稿",myCodes:"投稿履歴",
    mySubtitle:"投稿したコードを確認",updates:"更新・通知",
    updatesSubtitle:"新着通知の設定",how:"使い方",howSubtitle:"コミュニティルール",
    langTitle:"言語",langHelp:"アプリの言語を選択し、ボットにも反映できます。",
    syncLang:"ボットに言語を反映",settingsChat:"ボット設定を開く",
    titleCodes:"招待コード一覧",codesNote:"Museによる認証はありません。",
    search:"コード・投稿者を検索",latest:"新着順",featured:"注目",
    refresh:"更新",prev:"前へ",next:"次へ",page:"ページ",of:"/",results:"件",
    emptyTitle:"見つかりませんでした",emptyNote:"検索条件を変えるか更新してください。",
    detail:"招待コード詳細",platform:"プラットフォーム",source:"ソース",contributor:"投稿者",added:"追加日",
    remaining:"報告された残数",notReported:"報告なし",notLive:"リアルタイムではありません",
    community:"コミュニティ情報",status:"状態",copy:"コードをコピー",copied:"コピーしました！",
    openSite:"詳細ページを開く",watch:"ウォッチ",report:"利用結果を報告",
    worked:"使えた",failed:"使えなかった",disclaimer:"掲載はMuseの認証や使用可能性を保証しません。",
    titleShare:"公開コードを投稿",shareIntro:"英数字6文字のMuse招待コードを入力。Telegramで再確認後に公開GitHub Issueが作成されます。",
    inputLabel:"招待コード",inputExample:"ABC123",continue:"続行",invalid:"英数字6文字（A–Z、0–9）で入力してください。",
    confirmTitle:"Telegramで続けますか？",confirmShare:"{code}をボットに送信しますか？Telegramチャットで公開投稿の再確認が必要です。Telegramの身元は公開されません。",
    confirmReport:"{code}を{result}として報告しますか？公開GitHubコメント前にTelegramで再確認が必要です。",
    cancel:"キャンセル",confirm:"ボットで続行",standalone:"Telegramボットのキーボードから開いて操作してください。",
    titleHow:"Muse Invite Hubの使い方",how1:"コミュニティの公開コードを閲覧・コピーしてMuseで試してください。",
    how2:"実際に試したコードだけを報告。報告は審査対象で自動検証されません。",
    how3:"新規コードは公開GitHub Issueで審査後に掲載されます。",
    botOpens:"既存の非公開ボットチャットで続行します。",
    loading:"コードを読み込み中…",loadError:"コードを読み込めませんでした。更新してください。",
    publicSource:"コミュニティ",listed:"未認証",success:"利用成功の報告あり",
    unsuccessful:"利用失敗の報告あり",sendBot:"Telegramで続行"
  }
};
const tg=typeof window!=="undefined"?window.Telegram?.WebApp:null;
const byId=id=>document.getElementById(id);
const state={items:[],screen:"home",previous:"home",selected:null,
  query:"",page:0,sort:"newest",lang:"en",error:false};
function translate(key){return COPY[state.lang][key]||COPY.en[key]||key;}
function element(tag,cls,text){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined&&text!==null)node.textContent=String(text);
  return node;
}
function button(text,click,cls="button ghost"){
  const node=element("button",cls,text);
  node.type="button";
  node.addEventListener("click",click);
  return node;
}
function label(text){return element("span","field-label",text);}
function cardTitle(title,subtitle){
  const div=element("div","section-heading");
  const left=element("div");
  left.append(element("h2","",title),element("p","",subtitle));
  div.append(left);return div;
}
function stack(){return element("div","screen-stack");}
function panel(){return element("section","panel");}
function toast(message){
  const node=byId("toast");node.textContent=message;node.hidden=false;
  if(toast.id)clearTimeout(toast.id);
  toast.id=setTimeout(()=>{node.hidden=true;},3000);
}
function jump(screen){state.previous=state.screen;state.screen=screen;render();}
function returnBack(){
  if(state.screen==="detail")jump("browse");
  else if(state.screen==="how")jump("home");
  else jump("home");
}
function updateChrome(){
  const nav=byId("navigation");
  nav.hidden=state.screen==="home";
  byId("back").textContent="‹ "+translate("back");
  byId("section-title").textContent=translate(
    ({browse:"titleCodes",detail:"detail",contribute:"titleShare",settings:"settings",how:"how",my:"myCodes",updates:"updates"})[state.screen]||"home");
  for(const item of document.querySelectorAll("[data-nav]")){
    const active=item.dataset.nav===state.screen||
      (state.screen==="detail"&&item.dataset.nav==="browse");
    item.classList.toggle("active",active);
    item.querySelector("small").textContent=translate(
      {home:"home",browse:"codes",contribute:"share",settings:"settings"}[item.dataset.nav]);
  }
  if(tg?.BackButton){
    if(nav.hidden)tg.BackButton.hide();
    else tg.BackButton.show();
  }
}
function render(){
  const root=byId("screen");root.replaceChildren();updateChrome();
  const views={home:renderHome,browse:renderBrowse,detail:renderDetail,
    contribute:renderContribute,settings:renderSettings,how:renderHow,
    my:renderMy,updates:renderUpdates};
  (views[state.screen]||renderHome)(root);
}
async function loadCatalog(){
  const screen=byId("screen");
  if(screen)screen.setAttribute("aria-busy","true");
  try{
    const response=await fetch("../data/invites.json",{cache:"no-store"});
    if(!response.ok)throw Error("Catalog unavailable");
    const rows=await response.json();
    if(!Array.isArray(rows))throw Error("Invalid catalog");
    state.items=rows.filter(row=>row&&CODE.test(row.code||""));
    state.error=false;
  }catch{state.error=true;}
  finally{if(screen)screen.setAttribute("aria-busy","false");render();}
}
function actionTile(title,subtitle,icon,dest,featured=false){
  const item=button(" ",()=>jump(dest),"action"+(featured?" featured":""));
  item.replaceChildren(element("span","emoji",icon),element("strong","",title),
    element("small","",subtitle));
  return item;
}
function renderHome(root){
  const list=stack(),hero=element("section","hero");
  hero.append(element("span","eyebrow",translate("eyebrow")),
    element("h1","",translate("hero")),element("p","",translate("heroNote")),
    element("span","seal","🎟"));
  const actions=element("div","action-grid");
  actions.append(
    actionTile(translate("findCodes"),translate("findSubtitle"),"🎟","browse",true),
    actionTile(translate("shareCode"),translate("shareSubtitle"),"＋","contribute"),
    actionTile(translate("myCodes"),translate("mySubtitle"),"📋","my"),
    actionTile(translate("updates"),translate("updatesSubtitle"),"🔔","updates"),
    actionTile(translate("how"),translate("howSubtitle"),"ⓘ","how"),
    actionTile(translate("settings"),translate("langTitle"),"⚙","settings")
  );
  list.append(hero,cardTitle(translate("home"),translate("heroNote")),actions);
  root.append(list);
}
function renderBrowse(root){
  const list=stack();
  const heading=cardTitle(translate("titleCodes"),translate("codesNote"));
  const refresher=button("↻ "+translate("refresh"),async()=>await loadCatalog(),"button secondary");
  heading.append(refresher);
  const filters=element("div","filter-row");
  const search=element("input","input");search.type="search";search.maxLength=80;
  search.placeholder=translate("search");search.value=state.query;
  search.setAttribute("aria-label",translate("search"));
  const order=element("select","input");order.setAttribute("aria-label",translate("latest"));
  for(const [value,key] of [["newest","latest"],["featured","featured"]]){
    const option=element("option","",translate(key));option.value=value;order.append(option);
  }
  order.value=state.sort;
  order.addEventListener("change",()=>{state.sort=order.value;state.page=0;render();});
  const doSearch=()=>{state.query=search.value.slice(0,80);state.page=0;render();};
  search.addEventListener("change",doSearch);
  search.addEventListener("keydown",event=>{if(event.key==="Enter"){search.blur();doSearch();}});
  filters.append(search,order);list.append(heading,filters);
  if(state.error){
    const warn=panel();warn.append(element("p","",translate("loadError")));
    warn.append(button(translate("refresh"),loadCatalog,"button primary full"));list.append(warn);
    root.append(list);return;
  }
  const result=pageCatalog(state.items,{query:state.query,page:state.page,sort:state.sort});
  state.page=result.page;
  const summary=element("div","row");
  summary.append(element("span","tag",result.total+" "+translate("results")),
    element("span","muted",translate("page")+" "+(result.page+1)+" "+translate("of")+" "+result.pages));
  list.append(summary);
  const cards=element("div","card-stack");
  if(!result.entries.length){
    const empty=element("section","panel empty");
    empty.append(element("span","emoji","🔎"),element("h3","",translate("emptyTitle")),
      element("p","",translate("emptyNote")));cards.append(empty);
  }
  for(const item of result.entries){
    const node=button("",()=>{state.selected=item.code;jump("detail");},"code-card");
    const left=element("span","left");
    left.append(element("strong","code",item.code),
      element("span","tag",platformOf(item)),
      element("span","meta",(remainingOf(item)===null?translate("notReported"):
        translate("remaining")+": "+remainingOf(item))+" · "+translate("notLive")));
    node.append(left,element("span","details-arrow","›"));cards.append(node);
  }
  list.append(cards);
  const pagination=element("div","pagination");
  const prev=button("‹ "+translate("prev"),()=>{state.page--;render();},"button secondary");
  prev.disabled=!result.hasPrev;
  const next=button(translate("next")+" ›",()=>{state.page++;render();},"button primary");
  next.disabled=!result.hasNext;
  pagination.append(prev,next);list.append(pagination);
  root.append(list);
}
function navigateSite(code){
  const url="https://muse.eplus.dev/codes/"+encodeURIComponent(code)+"/";
  if(tg?.openLink)tg.openLink(url);else window.open(url,"_blank","noopener,noreferrer");
}
async function copyCode(code){
  try{await navigator.clipboard.writeText(code);toast(translate("copied"));}
  catch{toast(code);}
}
function showConfirm(title,body,onConfirm){
  const dialog=byId("confirm-dialog");
  byId("confirm-title").textContent=title;
  byId("confirm-copy").textContent=body;
  byId("confirm-cancel").textContent=translate("cancel");
  byId("confirm-yes").textContent=translate("confirm");
  byId("confirm-cancel").onclick=()=>dialog.close();
  byId("confirm-yes").onclick=()=>{dialog.close();onConfirm();};
  dialog.showModal();
}
function sendToBot(action,data={}){
  let payload;
  try{payload=buildBotPayload(action,data);}catch{return toast(translate("invalid"));}
  if(typeof tg?.sendData!=="function"||
      (!window.TelegramWebviewProxy&&!window.TelegramWebviewProxyProto&&
        !location.hash.includes("tgWebAppPlatform="))){
    return toast(translate("standalone"));
  }
  try{tg.sendData(payload);}
  catch{toast(translate("standalone"));}
}
function renderDetail(root){
  const code=normalizeInviteCode(state.selected);
  const item=state.items.find(row=>row.code===code);
  if(!item){jump("browse");return;}
  const list=stack(),card=panel(),header=element("div","info-head");
  header.append(element("span","large-icon","🎟"),element("h2","",item.code),
    element("p","",translate("community")));
  const stats=element("div","stats-grid");
  const statuses={
    "reported-working":"success",
    "reported-not-working":"unsuccessful",
    "unverified":"listed"
  };
  const fields=[
    [translate("platform"),platformOf(item)],
    [translate("status"),translate(statuses[item.status]||"listed")],
    [translate("contributor"),typeof item.submittedBy==="string"?item.submittedBy:translate("publicSource")],
    [translate("added"),item.addedAt||"—"],
    [translate("remaining"),remainingOf(item)===null?translate("notReported"):
      String(remainingOf(item))+" · "+item.usageReportedAt],
    [translate("source"),translate("publicSource")]
  ];
  for(const [name,value] of fields){
    const stat=element("div","stat");
    stat.append(element("small","",name),element("strong","",value));stats.append(stat);
  }
  card.append(header,stats);
  const warning=element("div","warning",translate("disclaimer"));
  const actions=element("div","two-buttons");
  actions.append(button("📋 "+translate("copy"),()=>copyCode(code),"button primary"),
    button("🔗 "+translate("openSite"),()=>navigateSite(code),"button secondary"),
    button("🔄 "+translate("refresh"),loadCatalog,"button ghost"),
    button("📌 "+translate("watch"),()=>sendToBot("watch",{code}),"button ghost"));
  const report=panel();report.append(element("h3","",translate("report")));
  const options=element("div","two-buttons");
  for(const result of ["worked","failed"]){
    options.append(button((result==="worked"?"✅ ":"❌ ")+translate(result),()=>
      showConfirm(translate("confirmTitle"),
        translate("confirmReport").replace("{code}",code).replace("{result}",translate(result)),
        ()=>sendToBot("report",{code,result})),
      result==="worked"?"button green":"button secondary"));
  }
  report.append(options);
  list.append(card,warning,actions,report,
    button("‹ "+translate("back")+" · "+translate("titleCodes"),()=>jump("browse"),"button ghost full"));
  root.append(list);
}
function renderContribute(root){
  const list=stack(),main=panel();
  const info=element("div","info-head");
  info.append(element("span","large-icon","＋"),element("h2","",translate("titleShare")),
    element("p","",translate("shareIntro")));
  const group=element("div","form-group");
  group.append(label(translate("inputLabel")));
  const input=element("input","input code-input");
  input.type="text";input.maxLength=6;input.autocomplete="off";input.autocapitalize="characters";
  input.spellcheck=false;input.placeholder=translate("inputExample");
  input.setAttribute("aria-label",translate("inputLabel"));
  const submit=button(translate("continue")+" →",()=>{
    const code=normalizeInviteCode(input.value);
    if(!code){toast(translate("invalid"));return;}
    showConfirm(translate("confirmTitle"),translate("confirmShare").replace("{code}",code),
      ()=>sendToBot("submit",{code}));
  },"button primary full");
  input.addEventListener("input",()=>{input.value=input.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);});
  group.append(input,submit);
  main.append(info,group,element("p","note",translate("botOpens")));
  list.append(main,element("div","warning",translate("disclaimer")));
  root.append(list);
}
function renderSettings(root){
  const list=stack(),main=panel();
  main.append(element("h2","",translate("langTitle")),element("p","",translate("langHelp")));
  const actions=element("div","card-stack");
  for(const [lang,title] of [["en","English"],["vi","Tiếng Việt"],["ja","日本語"]]){
    actions.append(button((state.lang===lang?"✓ ":"")+title,()=>{
      state.lang=lang;try{localStorage.setItem("muse-mini-lang",lang);}catch{}
      byId("language").value=lang;document.documentElement.lang=lang;render();
    },"button ghost full"));
  }
  main.append(actions);
  list.append(main,button(translate("syncLang"),()=>sendToBot("language",{language:state.lang}),"button primary full"),
    button(translate("settingsChat"),()=>sendToBot("settings"),"button secondary full"));
  root.append(list);
}
function renderHow(root){
  const list=stack(),main=panel();
  main.append(element("h2","",translate("titleHow")));
  for(const [i,key] of ["how1","how2","how3"].entries()){
    const p=element("p","",(i+1)+". "+translate(key));main.append(p);
  }
  list.append(main,button(translate("findCodes"),()=>jump("browse"),"button primary full"));
  root.append(list);
}
function renderMy(root){
  const list=stack(),main=panel();
  main.append(element("h2","",translate("myCodes")),
    element("p","",translate("botOpens")));
  list.append(main,button(translate("sendBot"),()=>sendToBot("my"),"button primary full"));root.append(list);
}
function renderUpdates(root){
  const list=stack(),main=panel();
  main.append(element("h2","",translate("updates")),
    element("p","",translate("botOpens")));
  list.append(main,button(translate("sendBot"),()=>sendToBot("notifications"),"button primary full"));
  root.append(list);
}
function init(){
  const given=new URL(location.href).searchParams.get("lang");
  let stored=null;try{stored=localStorage.getItem("muse-mini-lang");}catch{}
  state.lang=["en","vi","ja"].includes(given)?given:["en","vi","ja"].includes(stored)?stored:"en";
  byId("language").value=state.lang;
  document.documentElement.lang=state.lang;
  byId("language").addEventListener("change",e=>{
    state.lang=e.target.value;
    try{localStorage.setItem("muse-mini-lang",state.lang);}catch{}
    document.documentElement.lang=state.lang;render();
  });
  byId("back").addEventListener("click",returnBack);
  for(const btn of document.querySelectorAll("[data-nav]")){
    btn.addEventListener("click",()=>jump(btn.dataset.nav));
  }
  if(tg){
    try{tg.ready();tg.expand();tg.BackButton?.onClick(returnBack);}catch{}
  }
  render();loadCatalog();
}
if(typeof document!=="undefined")init();
