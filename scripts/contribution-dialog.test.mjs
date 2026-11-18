import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { renderDetailPage } from "./site-pages.mjs";
import { renderContributionDialog } from "./contribution-dialog.mjs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const home=read("index.html"),country=read("countries/index.html");
const source=read("assets/site-ui.js"),style=read("assets/styles.css");
const detail=renderDetailPage({
  id:"modal-test",code:"DPNIHH",status:"unverified",
  addedAt:"2026-11-11",submittedBy:"hoangsvit",ownerConfirmed:true
});
const shareUrl="https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml";

test("all site page layouts retain current design and render the same native share dialog",()=>{
  const variants=[[home,"./"],[country,"../"],[detail,"../../"]];
  for (const [html,prefix] of variants) {
    assert.equal((html.match(/id="contribute"/g)||[]).length,1);
    assert.ok(html.includes(renderContributionDialog(prefix)));
    assert.match(html, /https:\/\/t\.me\/muse_invite_hub_bot/);
    assert.match(html,/<dialog id="contribute" class="contribute-dialog"/);
    assert.match(html,/<a[^>]+data-contribute-trigger aria-haspopup="dialog"/);
    assert.match(html,new RegExp('href="'+shareUrl.replaceAll("?","\\?")+'"'));
    assert.match(html, /data-contribute-close aria-label="Close contribution choices"/);
  }
  assert.match(home,/<section class="overview container"/);
  assert.match(home,/<section class="hero container"/);
  assert.match(detail,/class="detail-code-panel detail-hero-unified"/);
  assert.match(detail,/class="detail-stats" aria-label="Invite quota information"/);
  assert.match(country, /class="country-disclaimer"/);
});
test("modal is styled only with current brand tokens and phone-sized cards",()=>{
  assert.match(style,/\.contribute-dialog\{[^}]*var\(--blue-line\)[^}]*var\(--surface\)/);
  assert.match(style, /@media\(max-width:650px\)\{\.contribute-dialog\{/);
  assert.match(style,/\.contribute-option\{[^}]*min-width:0/);
  assert.match(style,/\.detail-hero-unified \.detail-stats\{/);
  assert.doesNotMatch(style,/\.hero-telegram-link\{/);
});
test("Telegram contribution opens the configured bot directly, never a share picker or guide",()=>{
  const html=renderContributionDialog("../../");
  assert.match(html,/Telegram/);
  assert.match(html,/GitHub form/);
  assert.match(html,/Give code feedback/);
  assert.match(html, /href="https:\/\/t\.me\/muse_invite_hub_bot"/);
  assert.match(html, /Open Telegram/);
  assert.doesNotMatch(html, /TELEGRAM_BOT_GUIDE\.md|t\.me\/share\/url/);
  assert.match(html,/href="\.\.\/\.\.\/#codes"/);
  assert.match(html,/src="\.\.\/\.\.\/assets\/contribute-qr\.svg"/);
  assert.throws(()=>renderContributionDialog("../../../"),/Unexpected page path/);
});

function simulate({legacy=false,path="/codes/DPNIHH/",hash=""}={}){
  const callbacks=new Map(),dialogCallbacks=new Map();
  let htmlInjected="",appended=0;
  const close={addEventListener:(event,fn)=>dialogCallbacks.set("close:"+event,fn)};
  const feedback={addEventListener:(event,fn)=>dialogCallbacks.set("feedback:"+event,fn)};
  const dialog={
    open:false,opened:0,closed:0,
    showModal(){this.open=true;this.opened++;},
    close(){this.open=false;this.closed++;},
    querySelector:sel=>sel==="[data-contribute-close]"?close:sel==="[data-contribute-feedback]"?feedback:null,
    addEventListener:(event,fn)=>dialogCallbacks.set("dialog:"+event,fn)
  };
  const links=Array.from({length:3},()=>({handlers:{},addEventListener(event,fn){this.handlers[event]=fn;}}));
  const document={
    readyState:"complete",body:{append(){appended++;}},
    getElementById:id=>id==="contribute" && !legacy?dialog:null,
    querySelector:()=>null,
    querySelectorAll:sel=>sel==="[data-contribute-trigger], .nav-share, .nav-mobile-share"?links:[],
    createElement:tag=>{
      assert.equal(tag,"template");
      return {set innerHTML(v){htmlInjected=v;},get content(){return {firstElementChild:dialog};}};
    },
    addEventListener(){}
  };
  const events=new Map();
  const window={location:{pathname:path,hash},addEventListener:(event,fn)=>events.set(event,fn)};
  runInNewContext(source,{window,document});
  return {dialog,links,events,dialogCallbacks,appended,html:()=>htmlInjected};
}
test("share opens once in place; Escape/backdrop/close and QR hash are supported",()=>{
  const d=simulate();
  const event={prevented:false,preventDefault(){this.prevented=true;}};
  d.links[0].handlers.click(event);
  assert.equal(event.prevented,true);
  assert.equal(d.dialog.opened,1);
  d.links[1].handlers.click(event);
  assert.equal(d.dialog.opened,1);
  d.dialogCallbacks.get("close:click")();
  assert.equal(d.dialog.open,false);
  d.links[2].handlers.click(event);
  d.dialogCallbacks.get("dialog:click")({target:d.dialog});
  assert.equal(d.dialog.open,false);
  const h=simulate({hash:"#contribute"});
  assert.equal(h.dialog.open,true);
  assert.equal(h.dialog.opened,1);
});
test("preview detail uses only safe static modal and relative assets, no old page HTML",()=>{
  const detailPreview=simulate({legacy:true,path:"/pr-preview/pr-239/codes/DPNIHH/"});
  assert.equal(detailPreview.appended,1);
  assert.match(detailPreview.html(),/src="\.\.\/\.\.\/assets\/contribute-qr\.svg"/);
  assert.match(detailPreview.html(),/href="\.\.\/\.\.\/#codes"/);
  assert.match(detailPreview.html(), /https:\/\/t\.me\/muse_invite_hub_bot/);
  detailPreview.links[0].handlers.click({preventDefault(){}});
  assert.equal(detailPreview.dialog.open,true);
  const countryPreview=simulate({legacy:true,path:"/pr-preview/pr-239/countries/"});
  assert.match(countryPreview.html(),/src="\.\.\/assets\/contribute-qr\.svg"/);
});
