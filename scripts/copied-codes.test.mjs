import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const features = require("../assets/directory-features.js");
const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");

function memoryStore(initial={}) {
  const values=new Map(Object.entries(initial));
  return {
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,value),
    values
  };
}

test("copy history is separate from bookmarks, sanitized and capped", () => {
  assert.notEqual(features.COPIED_STORAGE_KEY,features.STORAGE_KEY);
  assert.equal(features.COPIED_STORAGE_KEY,"muse-invite-hub:copied-codes:v1");
  assert.deepEqual(features.parseCopied(null),[]);
  assert.deepEqual(features.parseCopied("{broken"),[]);
  assert.deepEqual(features.parseCopied(JSON.stringify(["CODE12","CODE12","DPNIHH","../bad",42,null])),
    ["CODE12","DPNIHH"]);
  const storage=memoryStore({
    [features.STORAGE_KEY]:JSON.stringify(["SAVE11"]),
    [features.COPIED_STORAGE_KEY]:JSON.stringify(["CODE12","DPNIHH"])
  });
  assert.deepEqual(features.rememberCopiedCode(storage,"DPNIHH"),["DPNIHH","CODE12"]);
  assert.deepEqual(JSON.parse(storage.getItem(features.STORAGE_KEY)),["SAVE11"]);
  assert.deepEqual(features.rememberCopiedCode(storage,"NEWS99"),["NEWS99","DPNIHH","CODE12"]);
  const list=Array.from({length:210},(_,i)=>"CODE"+String(i).padStart(3,"0"));
  storage.setItem(features.COPIED_STORAGE_KEY,JSON.stringify(list));
  const recorded=features.rememberCopiedCode(storage,"DPNIHH");
  assert.equal(recorded.length,features.MAX_SAVED);
  assert.equal(recorded[0],"DPNIHH");
  assert.equal(new Set(recorded).size,recorded.length);
  assert.deepEqual(features.rememberCopiedCode(storage,"../invalid"),null);
});

test("storage disabled does not turn a successful copy into a failed copy", () => {
  const locked={
    getItem(){throw Error("Storage denied");},
    setItem(){throw Error("Storage denied");}
  };
  assert.equal(features.rememberCopiedCode(locked,"DPNIHH"),null);
  const writeBlocked={getItem:()=>null,setItem:()=>{throw Error("Quota");}};
  assert.equal(features.rememberCopiedCode(writeBlocked,"DPNIHH"),null);
});

test("homepage applies copied tint only after clipboard success and syncs storage events", () => {
  const app=read("assets/app.js");
  const css=read("assets/styles.css");
  assert.match(app,/function updateCopiedCard\(card\)/);
  assert.match(app,/card\.classList\.toggle\("code-card-copied", copied\)/);
  assert.match(app,/function syncCopiedCards\(\)/);
  assert.match(app,/copiedCodes = new Set\(features\.parseCopied\(event\.key === null \? null : event\.newValue\)\)/);
  assert.match(app,/updateCopiedCard\(card\);\s*return card;/);
  assert.match(app,/Copy again/);
  assert.match(app,/Copied on this device · Redemption not verified/);
  const copy=app.slice(app.indexOf("async function copyCode("),app.indexOf("function socialSource("));
  assert.ok(copy.indexOf("await navigator.clipboard.writeText(value)") <
    copy.indexOf("features.rememberCopiedCode(window.localStorage, value)"));
  assert.ok(copy.indexOf("throw Error(\"Copy failed\")") <
    copy.indexOf("features.rememberCopiedCode(window.localStorage, value)"));
  assert.match(copy,/else copiedCodes\.add\(value\)/);
  assert.match(copy,/syncCopiedCards\(\)/);
  assert.match(css,/\.code-card\.code-card-copied\{border-color:#bda7ec/);
  assert.match(css,/\.code-card-featured\.code-card-copied \.card-copy/);
  assert.match(css,/\.card-facts \.card-copy-note/);
});

function detailHarness({ copied=false, failCopy=false }={}) {
  const copiedValue=copied?JSON.stringify(["DPNIHH"]):null;
  const storage=memoryStore(copiedValue?{[features.COPIED_STORAGE_KEY]:copiedValue}:{});
  const listeners=new Map(),events=new Map(),scheduled=[];
  const label={textContent:"Copy invite code"};
  const icon={className:"fa-regular fa-copy"};
  const button={
    dataset:{},
    setAttribute(name,value){this[name]=value;},
    querySelector:query=>query===".detail-copy-label"?label:
      query==="i"?icon:null,
    addEventListener:(name,callback)=>events.set(name,callback)
  };
  const panel={
    copied:false,
    classList:{toggle(name,enabled){
      if(name!=="detail-code-panel-copied")throw Error("Unexpected class");
      panel.copied=enabled;
    }}
  };
  const after=[];
  const actions={after:node=>after.push(node)};
  const document={
    getElementById:id=>({
      "detail-copy":button,"detail-code":{textContent:"DPNIHH"},
      "detail-live":{textContent:""}
    })[id]||null,
    querySelector:selector=>({
      ".detail-code-panel":panel,
      ".detail-action-row":actions
    })[selector]||null,
    querySelectorAll:()=>[],
    createElement:tag=>({tag,hidden:false,textContent:""})
  };
  const window={
    MuseDirectoryFeatures:features,
    localStorage:storage,
    isSecureContext:true,
    addEventListener:(name,callback)=>listeners.set(name,callback),
    setTimeout:callback=>{scheduled.push(callback);return scheduled.length;},
    clearTimeout:()=>{}
  };
  const navigator={
    clipboard:{
      writeText:async value=>{
        if(value!=="DPNIHH")throw Error("Wrong code");
        if(failCopy)throw Error("User denied clipboard");
      }
    }
  };
  runInNewContext(read("assets/detail.js"),{
    window,navigator,document,
    // Leave ancillary async Issue lookup pending; copy bindings must work immediately.
    fetch:()=>new Promise(()=>{})
  });
  return {storage,window,panel,button,label,icon,after,events,listeners,scheduled};
}

test("detail copied tint and Copy again survive reload and copy success", async () => {
  const browser=detailHarness({copied:true});
  assert.equal(browser.panel.copied,true);
  assert.equal(browser.label.textContent,"Copy again");
  assert.equal(browser.button.dataset.copied,"true");
  assert.equal(browser.after[0]?.hidden,false);
  const fresh=detailHarness();
  assert.equal(fresh.panel.copied,false);
  assert.equal(fresh.after[0]?.hidden,true);
  await fresh.events.get("click")();
  assert.equal(fresh.panel.copied,true);
  assert.deepEqual(JSON.parse(fresh.storage.getItem(features.COPIED_STORAGE_KEY)),["DPNIHH"]);
  assert.equal(fresh.label.textContent,"Copied!");
  fresh.scheduled[0]();
  assert.equal(fresh.label.textContent,"Copy again");
  assert.equal(fresh.button.dataset.copied,"true");
});

test("clipboard failure never marks code as copied", async () => {
  const browser=detailHarness({failCopy:true});
  await browser.events.get("click")();
  assert.equal(browser.panel.copied,false);
  assert.equal(browser.storage.getItem(features.COPIED_STORAGE_KEY),null);
  assert.equal(browser.label.textContent,"Copy failed");
  browser.scheduled[0]();
  assert.equal(browser.label.textContent,"Copy invite code");
});

test("copy state synchronizes from other tabs and keeps redemption separate", () => {
  const browser=detailHarness();
  const change=browser.listeners.get("storage");
  assert.equal(typeof change,"function");
  change({key:features.COPIED_STORAGE_KEY,newValue:JSON.stringify(["DPNIHH"])});
  assert.equal(browser.panel.copied,true);
  assert.equal(browser.label.textContent,"Copy again");
  change({key:features.COPIED_STORAGE_KEY,newValue:"[]"});
  assert.equal(browser.panel.copied,false);
  assert.equal(browser.label.textContent,"Copy invite code");
  const css=read("assets/styles.css"),detail=read("assets/detail.js");
  assert.match(css,/\.detail-code-panel\.detail-code-panel-copied\{/);
  assert.match(css,/\.detail-code-panel-copied #detail-copy\{/);
  assert.match(detail,/Redemption not verified/);
});
