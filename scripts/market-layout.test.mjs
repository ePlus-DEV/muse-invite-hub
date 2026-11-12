import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderDetailPage, renderDetailMarketAvailability } from "./site-pages.mjs";

const read = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const home = read("index.html");
const css = read("assets/styles.css");
const item = {id:"owner",code:"DPNIHH",addedAt:"2026-11-11",submittedBy:"hoangsvit",
  status:"unverified",ownerConfirmed:true,featured:true};

test("mobile Search and Sort share one horizontal row, preserving keyboard-friendly controls",()=>{
  assert.match(home, /<div class="directory-toolbar">[\s\S]*?<label class="search-field"[\s\S]*?<div class="sort-field">/);
  assert.match(home, /id="code-search" type="search"/);
  assert.match(home, /id="sort-trigger" aria-haspopup="menu"/);
  assert.match(home, /id="sort-menu" role="menu"/);
  assert.match(home, /<div class="source-filters" role="group"/);
  assert.match(css, /@media\(max-width:620px\)\{[\s\S]*?\.directory-toolbar\{flex-direction:row;align-items:stretch;gap:8px/);
  assert.match(css, /\.directory-toolbar \.search-field\{flex:1 1 0;width:auto;min-width:0/);
  assert.match(css, /\.directory-toolbar \.sort-field\{flex:0 0 clamp\(122px,37vw,148px\)/);
  assert.match(css, /\.directory-toolbar #sort-current\{min-width:0;overflow:hidden;text-overflow:ellipsis/);
  assert.match(css, /@media\(max-width:360px\)\{[\s\S]*?\.directory-toolbar \.sort-field\{flex-basis:118px/);
  assert.match(css, /\.directory-toolbar \.sort-menu\{min-width:188px/);
  // CSS keeps the sorting list available; no mobile-only second control.
  assert.equal((home.match(/id="sort-trigger"/g)||[]).length,1);
});

test("country disclosure summary is compact and lists the same five sourced countries",()=>{
  assert.match(home, /<section class="availability-section" id="availability" aria-labelledby="availability-title">/);
  assert.match(home, /<details class="availability-disclosure">[\s\S]*?<summary>/);
  assert.match(home, /class="availability-summary-main"/);
  assert.match(home, /class="availability-summary-end"/);
  assert.match(home, /Where is Muse available\?/);
  assert.match(home, /5 confirmed markets · Updated 12 Nov 2026/);
  assert.match(css, /\.availability-summary-main\{display:flex;align-items:center/);
  assert.match(css, /\.availability-market-list\{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.availability-market-list\{grid-template-columns:1fr;gap:7px\}/);
  const codes=[...home.matchAll(/<li data-country="([A-Z]{2})">/g)].map(x=>x[1]);
  assert.deepEqual(codes,["US","CA","JP","SG","MX"]);
  assert.equal((home.match(/class="availability-market"/g)||[]).length,5);
  assert.match(home, /Vietnam is not among these announced launch markets/);
  assert.match(home, /An invite code does not override geographic restrictions/);
  assert.equal((home.match(/class="availability-flags"/g)||[]).length,1);
  assert.equal((home.match(/<details class="availability-disclosure">/g)||[]).length,1);
});

test("detail pages reuse the exact homepage source list and flag assets with correct relative paths",()=>{
  const markup=renderDetailMarketAvailability();
  const detail=renderDetailPage(item);
  const preview=renderDetailPage(item,{basePath:"/pr-preview/pr-123/",preview:true});
  for (const html of [detail,preview]) {
    assert.match(html, /<section class="availability-section detail-market-section" id="detail-availability"/);
    assert.match(html, /aria-labelledby="detail-availability-title"/);
    assert.match(html, /id="detail-availability-title">Where is Muse available\?/);
    assert.equal((html.match(/<li data-country="[A-Z]{2}">/g)||[]).length,5);
    assert.ok(html.includes(markup),"Detail should show the trusted static country disclosure");
    assert.match(html, /src="\.\.\/\.\.\/assets\/flags\/jp\.svg"/);
    assert.match(html, /src="\.\.\/\.\.\/assets\/flags\/mx\.svg"/);
    assert.match(html, /https:\/\/about\.fb\.com\/news\/2026\/09\/introducing-muse-personal-ai-agent/);
    assert.match(html, /Check your eligibility with Muse/);
  }
  assert.match(detail, /<meta name="robots" content="index,follow">/);
  assert.match(detail, /rel="canonical" href="https:\/\/muse\.eplus\.dev\/codes\/DPNIHH\/"/);
  assert.match(preview, /noindex,nofollow,noarchive/);
  assert.equal((detail.match(/id="detail-availability"/g)||[]).length,1);
  assert.ok(detail.indexOf('id="detail-availability"') > detail.indexOf('id="how-to-redeem"'));
  assert.ok(detail.indexOf('id="detail-availability"') < detail.indexOf('class="detail-side"'));
});

test("every homepage flag and Meta confirmation is present exactly once in the detail disclosure",()=>{
  const detail=renderDetailMarketAvailability();
  for(const code of ["us","ca","jp","sg","mx"]){
    assert.equal((home.match(new RegExp('src="\\./assets/flags/'+code+'\\.svg"','g'))||[]).length,2);
    assert.equal((detail.match(new RegExp('src="\\.\\./\\.\\./assets/flags/'+code+'\\.svg"','g'))||[]).length,2);
  }
  const sources=[...home.matchAll(/href="(https:\/\/about\.fb\.com\/[^"]+)"/g)].map(x=>x[1]);
  assert.equal(sources.length,5);
  for(const url of sources){
    assert.equal(detail.split('href="'+url+'"').length-1,1);
  }
});
