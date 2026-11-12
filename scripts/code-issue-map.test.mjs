import test from "node:test";
import assert from "node:assert/strict";
import {
  issueMarker, issueCode, originalIssueNumber, canonicalThreadBody,
  syncCodeIssueMap, validIssueMap, resolveExistingIssue
} from "./code-issue-map.mjs";
import { feedbackCodeForIssue, shouldReopen } from "./reopen-code-feedback.mjs";

const contributor = {id:"community-issue-55",code:"IY56PP"};
const seeded = {id:"eplus-owner-dpnihh",code:"DPNIHH"};
const foreign = {id:"jx-issue-63",code:"UPWS4W"};
const oldIssue={number:55,title:"[Invite] IY56PP",state:"closed",
  body:"### Invite code\n\nIY56PP\n\n### Code source\n\nGitHub (my own code)"};
const regularComment={id:101,body:"Code: IY56PP\nResult: Muse rejected my code",
  user:{login:"reviewer",type:"User"}};

test("parse original contribution Issue, but never treat foreign repo issue IDs as local",()=>{
  assert.equal(originalIssueNumber(contributor),55);
  assert.equal(originalIssueNumber(seeded),null);
  assert.equal(originalIssueNumber(foreign),null);
  assert.equal(issueCode(oldIssue),"IY56PP");
  assert.equal(issueCode({...oldIssue,pull_request:{url:"fake"}}),null);
  assert.equal(issueCode({...oldIssue,body:"### Invite code\n\nOTHER1"}),"OTHER1");
  assert.equal(issueCode({number:5,title:"[Code] ABC123",body:issueMarker("ABC123")}),"ABC123");
  assert.throws(()=>issueMarker("../evil"),/Invalid invite code/);
});

test("retain contributor Issue and create one canonical thread for manually-added or external codes",async()=>{
  const apiIssues=[oldIssue];const created=[];
  const entries=[contributor,seeded,foreign];
  const create=async field=>{
    const issue={number:100+created.length,title:field.title,body:field.body,state:"open"};
    created.push(issue);
    return issue;
  };
  const map=await syncCodeIssueMap(entries,async()=>apiIssues,create);
  assert.deepEqual(map,{IY56PP:55,DPNIHH:100,UPWS4W:101});
  assert.equal(created.length,2);
  assert.match(created[0].body,/muse-code-feedback-thread: DPNIHH/);
  assert.match(created[0].body,/https:\/\/muse\.eplus\.dev\/codes\/DPNIHH\//);
  assert.ok(validIssueMap(map,entries));
  const rerun=await syncCodeIssueMap(entries,async()=>apiIssues,create);
  assert.deepEqual(rerun,map);
  assert.equal(created.length,2,"idempotent rerun must never duplicate Issues");
});

test("canonical owner mapping survives unrelated Issue numbers and old foreign references",async()=>{
  const entries=[foreign,seeded];
  const already={number:97,title:"[Code] UPWS4W",body:canonicalThreadBody(foreign),state:"closed"};
  const map=await syncCodeIssueMap(entries,async()=>[already],async fields=>({
    number:98,title:fields.title,body:fields.body
  }));
  assert.deepEqual(map,{UPWS4W:97,DPNIHH:98});
  assert.equal(resolveExistingIssue(foreign,[oldIssue]),null);
  assert.equal(resolveExistingIssue(contributor,[oldIssue]),oldIssue);
  assert.equal(validIssueMap({IY56PP:55},entries),false);
});

test("reuse original count / Invite Issues and already-created feedback threads without duplication",async()=>{
  const published = [
    {id:"eplus-owner-dpnihh",code:"DPNIHH",feedbackIssueNumber:14},
    {id:"jx-issue-19",code:"ARKHZZ",feedbackIssueNumber:28},
    {id:"community-issue-55",code:"IY56PP",feedbackIssueNumber:55},
    {id:"jx-issue-63",code:"UPWS4W",feedbackIssueNumber:64}
  ];
  const existing = [
    {number:14,title:"[Count update] DPNIHH",state:"closed",
      body:"### Invite code\n\nDPNIHH\n\n### Remaining invites shown by Muse\n\n3"},
    {number:28,title:"[Invite] ARKHZZ — 17 uses left",state:"closed",
      body:"### Invite code\n\nARKHZZ\n\n### Code source\n\nGitHub (my own code)"},
    oldIssue,
    {number:64,title:"[Code discussion] UPWS4W",state:"open",
      body:"<!-- muse-code-feedback-root:UPWS4W -->\n## Invite code: UPWS4W"}
  ];
  const created=[];
  const mapping=await syncCodeIssueMap(published,async()=>existing,async values=>{
    created.push(values);
    throw Error("Never create duplicates of existing Issues");
  });
  assert.deepEqual(mapping,{DPNIHH:14,ARKHZZ:28,IY56PP:55,UPWS4W:64});
  assert.equal(created.length,0);
  assert.equal(issueCode(existing[0]),"DPNIHH");
  assert.equal(issueCode(existing[1]),"ARKHZZ");
  assert.equal(issueCode(existing[3]),"UPWS4W");
  assert.equal(feedbackCodeForIssue(existing[0],published),"DPNIHH");
  assert.equal(feedbackCodeForIssue(existing[1],published),"ARKHZZ");
  assert.equal(feedbackCodeForIssue(existing[3],published),"UPWS4W");
  const report={id:104,body:"I tried it and it did not work",user:{login:"member",type:"User"}};
  assert.equal(shouldReopen(existing[0],report,published),true);
  assert.equal(shouldReopen({...existing[3],state:"closed"},report,published),true);
});

test("readonly CI dry-run does not create Issues or invent thread numbers",async()=>{
  const created=[];
  const entries=[contributor,seeded,foreign];
  const map=await syncCodeIssueMap(entries,async()=>[oldIssue],async fields=>{
    created.push(fields);throw Error("Must remain read-only");
  },{allowMissing:true});
  assert.deepEqual(map,{IY56PP:55});
  assert.equal(created.length,0);
});

test("reject duplicate canonical Issue threads and malformed creations",async()=>{
  const entries=[seeded];
  const duplicate=[67,68].map(number=>({number,title:"[Code] DPNIHH",
    body:canonicalThreadBody(seeded)}));
  await assert.rejects(syncCodeIssueMap(entries,async()=>duplicate,async()=>null),
    /Duplicate canonical feedback issues/);
  await assert.rejects(syncCodeIssueMap(entries,async()=>[],async()=>({number:79,title:"wrong",body:"wrong"})),
    /Could not verify GitHub issue/);
  await assert.rejects(syncCodeIssueMap([{...seeded,code:"../X"}],async()=>[],async()=>null),
    /Invalid or duplicate/);
});

test("reopen only genuine user feedback on the canonical code issue",()=>{
  assert.equal(feedbackCodeForIssue(oldIssue,[contributor]),"IY56PP");
  assert.equal(shouldReopen(oldIssue,regularComment,[contributor]),true);
  assert.equal(shouldReopen({...oldIssue,state:"open"},regularComment,[contributor]),false);
  assert.equal(shouldReopen(oldIssue,{...regularComment,user:{login:"github-actions[bot]",type:"Bot"}},[contributor]),false);
  assert.equal(shouldReopen(oldIssue,{...regularComment,body:" "},[contributor]),false);
  assert.equal(shouldReopen({...oldIssue,number:5},regularComment,[contributor]),false);
  assert.equal(shouldReopen({...oldIssue,pull_request:{}},regularComment,[contributor]),false);
  assert.equal(shouldReopen({...oldIssue,body:"wrong"},regularComment,[contributor]),false);
  const mapped={number:103,state:"closed",title:"[Code] DPNIHH",body:canonicalThreadBody(seeded)};
  assert.equal(shouldReopen(mapped,regularComment,[seeded]),true);
});
