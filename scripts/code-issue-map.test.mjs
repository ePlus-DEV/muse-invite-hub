import test from "node:test";
import assert from "node:assert/strict";
import {
  issueMarker, issueCode, issueCodes, parseInviteCodes, originalIssueNumber, canonicalThreadBody,
  syncCodeIssueMap, validIssueMap, resolveExistingIssue, withCanonicalIssueRefs
} from "./code-issue-map.mjs";
import { feedbackCodeForIssue, shouldReopen, unrelatedReferralCode, referralIssueMatches, reopenOnFeedback, pendingReferralAssignee } from "./reopen-code-feedback.mjs";

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

test("a new owner count Issue must not replace the reviewed canonical DPNIHH thread",async()=>{
  const canonical={
    number:14,title:"[Count update]",state:"closed",
    body:"### Invite code\n\nDPNIHH\n\n### Remaining invites shown by Muse\n\n3"
  };
  const newerReport={
    number:86,title:"[Count update] DPNIHH",state:"open",
    body:"### Invite code\n\nDPNIHH\n\n### Remaining invites shown by Muse\n\n25"
  };
  const item={...seeded,feedbackIssueNumber:14};
  assert.equal(resolveExistingIssue(item,[newerReport,canonical]),canonical);
  const map=await syncCodeIssueMap([item],async()=>[newerReport,canonical],async()=>{
    throw Error("Must not create another thread");
  });
  assert.deepEqual(map,{DPNIHH:14});
});

test("an explicit conflicting root remains an error even with a reviewed mapping",()=>{
  const canonical={number:14,title:"[Count update]",body:"### Invite code\n\nDPNIHH"};
  const duplicateRoot={number:86,title:"[Code] DPNIHH",body:canonicalThreadBody(seeded)};
  assert.throws(()=>resolveExistingIssue({...seeded,feedbackIssueNumber:14},
    [canonical,duplicateRoot]),/Duplicate canonical feedback issues/);
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
  assert.equal(shouldReopen(oldIssue,{...regularComment,user:{login:"eplus-bot",type:"User"}},[contributor]),false);
  assert.equal(shouldReopen(oldIssue,{...regularComment,body:" "},[contributor]),false);
  assert.equal(shouldReopen({...oldIssue,number:5},regularComment,[contributor]),false);
  assert.equal(shouldReopen({...oldIssue,pull_request:{}},regularComment,[contributor]),false);
  assert.equal(shouldReopen({...oldIssue,body:"wrong"},regularComment,[contributor]),false);
  const mapped={number:103,state:"closed",title:"[Code] DPNIHH",body:canonicalThreadBody(seeded)};
  assert.equal(shouldReopen(mapped,regularComment,[seeded]),true);
});

test("a different-language referral cannot reopen an unrelated canonical Issue",()=>{
  const chinese="快来看看你的个人 AI 智能体 Muse 。在加入后的 48 小时内通过“设置”兑现我的邀请码，我们就能分别获得 10 亿个 Muse 词元。\n\n"+
    "邀请码：MIN0OF\nhttps://muse.ai/join";
  const changed=oldIssue;
  assert.equal(unrelatedReferralCode(chinese,["IY56PP"]),"MIN0OF");
  assert.equal(unrelatedReferralCode(chinese,["IY56PP","MIN0OF"]),null);
  assert.equal(shouldReopen(changed,{...regularComment,body:chinese},[contributor]),false);
  assert.equal(shouldReopen(changed,{...regularComment,body:"Code: IY56PP\nResult: worked"},[contributor]),true);
  for(const content of [
    chinese.replace("https://muse.ai/join",""),
    chinese.replace("MIN0OF","IY56PP"),
    chinese+"\n邀请码：OTHER1",
    "I tried MIN0OF and it failed."
  ]) assert.equal(unrelatedReferralCode(content,["IY56PP"]),null);
});

test("new code from Chinese comment is deduplicated against existing Issue #224",()=>{
  const otherIssue={number:224,title:"[Invite] MIN0OF",state:"open",
    body:"### Invite code\n\nMIN0OF\n\n### Code source\n\nGitHub (my own code)\n\n### Contributor checklist\n\n- [x] ownership"};
  assert.deepEqual(referralIssueMatches([oldIssue,otherIssue,{...otherIssue,pull_request:{}}],"MIN0OF"),[otherIssue]);
  const candidate={number:226,title:"[Invite candidate] MIN0OF — confirmation required",
    body:"<!-- muse-comment-referral-candidate:MIN0OF -->"};
  assert.deepEqual(referralIssueMatches([candidate],"MIN0OF"),[candidate]);
  assert.deepEqual(referralIssueMatches([candidate],"OTHER1"),[]);
  assert.throws(()=>referralIssueMatches([oldIssue],"OTHER"),/Invalid candidate lookup/);
});

test("comment intake auto-creates only unverified tracking Issues, never an invite PR",async()=>{
  const message="快来看看你的个人 AI 智能体 Muse 。\n邀请码：MIN0OF\nhttps://muse.ai/join";
  const base={...oldIssue,number:55,state:"closed",body:
    "### Invite code\n\nIY56PP\n\n### Code source\n\nGitHub (my own code)\n\n### Contributor checklist\n\n- [x] authorized"};
  const user={login:"Wang-bbb",id:350407184,type:"User"};
  const submitted={id:6935502783,body:message,user,issue_url:
    "https://api.github.com/repos/ePlus-DEV/muse-invite-hub/issues/55"};
  function setup({issues=[base],published=false,ack=false,failCreate=false,reporter=user,eligible=false}={}){
    const events=[];
    const comments=ack?[{user:{login:"github-actions[bot]"},
      body:"<!-- muse-unrelated-referral:6935502783 -->"}]:[];
    const source={...submitted,user:reporter};
    const list=[...issues];
    const targetComments=new Map();
    async function request(raw,options={}){
      const url=new URL(raw);
      const method=options.method||"GET";
      const path=url.pathname.replace("/repos/ePlus-DEV/muse-invite-hub/","");
      events.push(method+" "+path);
      let value;
      if(method==="GET" && path==="issues/55") value=base;
      else if(method==="GET" && /^issues\/[0-9]+$/.test(path)) value=list.find(row=>row.number===Number(path.split("/")[1]));
      else if(method==="GET" && path==="issues/comments/6935502783") value=source;
      else if(method==="GET" && path==="issues/comments/6935503000")
        value={...submitted,id:6935503000,body:"I can review this candidate",user:reporter,
          issue_url:"https://api.github.com/repos/ePlus-DEV/muse-invite-hub/issues/224"};
      else if(method==="GET" && path==="issues/55/comments")value=comments;
      else if(method==="GET" && /^issues\/[0-9]+\/comments$/.test(path))
        value=targetComments.get(Number(path.split("/")[1]))||[];
      else if(method==="GET" && /^issues\/[0-9]+\/assignees\/Wang-bbb$/.test(path))
        return eligible?{ok:true,status:204}:{ok:false,status:404};
      else if(method==="POST" && /^issues\/[0-9]+\/assignees$/.test(path)) {
        assert.equal(eligible,true);
        assert.deepEqual(JSON.parse(options.body),{assignees:["Wang-bbb"]});
        value={assignees:[{login:"Wang-bbb"}]};
      }
      else if(method==="GET" && path==="issues"){
        value=url.searchParams.get("page")==="1"?list:[];
      } else if(method==="POST" && path==="issues"){
        if(failCreate)return {ok:false,status:500};
        const body=JSON.parse(options.body);
        assert.match(body.title,/^\[Invite candidate\] MIN0OF/);
        assert.match(body.body,/muse-comment-referral-candidate:MIN0OF/);
        assert.match(body.body,/6935502783/);
        assert.match(body.body,/@Wang-bbb/);
        assert.doesNotMatch(body.body,/^\s*-\s*\[x\]/mi,"Never synthesize consent");
        value={number:225,title:body.title,body:body.body,state:"open"};
        list.push(value);
      } else if(method==="POST" && /^issues\/[0-9]+\/comments$/.test(path) && path!=="issues/55/comments") {
        const number=Number(path.split("/")[1]);
        const body=JSON.parse(options.body).body;
        assert.match(body,/<!-- muse-referral-assignee-request:6935502783:350407184:MIN0OF -->/);
        assert.match(body,/@Wang-bbb/);
        assert.match(body,/issues\/55#issuecomment-6935502783/);
        const target=[...(targetComments.get(number)||[]),{user:{login:"github-actions[bot]"},body}];
        targetComments.set(number,target);
        value={id:1000};
      } else if(method==="POST" && path==="issues/55/comments"){
        const body=JSON.parse(options.body).body;
        assert.match(body,/<!-- muse-unrelated-referral:6935502783 -->/);
        assert.match(body,published?/already listed/:/Share Code form/);
        comments.push({user:{login:"github-actions[bot]"},body});
        value={id:999};
      }else throw Error("Unexpected mock request "+method+" "+path+url.search);
      return {ok:true,status:200,json:async()=>value};
    }
    const catalog=published?[contributor,{id:"eplus-other-min0of",code:"MIN0OF"}]:[contributor];
    return {request,catalog,events,comments,list,targetComments};
  }
  async function run(m) {
    return reopenOnFeedback({repository:"ePlus-DEV/muse-invite-hub",
      token:"test",issueNumber:55,commentId:6935502783,
      request:m.request,catalog:m.catalog});
  }

  const fresh=setup();
  assert.deepEqual(await run(fresh),{
    outcome:"redirected",issueNumber:55,code:"MIN0OF",
    candidateIssueNumber:225,published:false
  });
  assert.equal(fresh.events.filter(x=>x==="POST issues").length,1);
  assert.equal(fresh.events.filter(x=>x==="POST issues/55/comments").length,1);
  assert.ok(!fresh.events.some(x=>x.startsWith("PATCH")));
  assert.equal((await run(fresh)).outcome,"already-notified");
  assert.equal(fresh.events.filter(x=>x==="POST issues").length,1);

  const issue224={number:224,state:"open",title:"[Invite] MIN0OF",
    body:"### Invite code\n\nMIN0OF\n\n### Code source\n\nGitHub (my own code)\n\n### Contributor checklist\n\n- [x] ownership"};
  const existing=setup({issues:[base,issue224]});
  assert.equal((await run(existing)).candidateIssueNumber,224);
  assert.equal(existing.events.filter(x=>x==="POST issues").length,0);
  assert.match(existing.comments[0].body,/Issue #224/);
  assert.ok(existing.events.includes("GET issues/224/assignees/Wang-bbb"));
  assert.ok(existing.events.includes("POST issues/224/comments"));
  assert.ok(!existing.events.includes("POST issues/224/assignees"));
  assert.equal(pendingReferralAssignee(issue224,{user,id:6935503000},
    existing.targetComments.get(224)),"MIN0OF");
  assert.equal(pendingReferralAssignee(issue224,
    {user:{...user,id:999},id:6935503000},existing.targetComments.get(224)),null);

  // After the original commenter replies in Issue #224, GitHub makes them
  // eligible for assignment. Do not forge ownership or checked consent.
  const eligibleReply=setup({issues:[base,issue224],eligible:true});
  await run(eligibleReply);
  assert.ok(eligibleReply.events.includes("POST issues/224/assignees"));
  assert.ok(!eligibleReply.events.includes("POST issues/224/comments"));
  const newlyEligible=setup({issues:[base,issue224],eligible:true});
  await run(newlyEligible); // produces an assignee or a pending note
  const retry=await reopenOnFeedback({repository:"ePlus-DEV/muse-invite-hub",
    token:"test",issueNumber:224,commentId:6935503000,
    request:existing.request,catalog:existing.catalog});
  assert.equal(retry.outcome,"assignee-pending","without GitHub eligibility, keep pending");

  const afterComment=setup({issues:[base,issue224],eligible:true});
  // Add the trusted bot request marker to the target Issue before the user reply.
  const marker="<!-- muse-referral-assignee-request:6935502783:350407184:MIN0OF -->";
  afterComment.targetComments.set(224,[{user:{login:"github-actions[bot]"},
    body:marker+"\n@Wang-bbb please comment on this Issue."}]);
  const result=await reopenOnFeedback({repository:"ePlus-DEV/muse-invite-hub",
    token:"test",issueNumber:224,commentId:6935503000,
    request:afterComment.request,catalog:afterComment.catalog});
  assert.deepEqual(result,{outcome:"assignee-added",issueNumber:224,code:"MIN0OF"});
  assert.ok(afterComment.events.includes("POST issues/224/assignees"));
  assert.ok(!afterComment.events.includes("POST issues"));
  assert.ok(!afterComment.events.includes("PATCH issues/224"));


  const live=setup({published:true});
  assert.deepEqual(await run(live),{outcome:"redirected",
    issueNumber:55,code:"MIN0OF",candidateIssueNumber:null,published:true});
  assert.ok(!live.events.includes("POST issues"));

  const duplicate=setup({issues:[issue224,{...issue224,number:226}]});
  assert.equal((await run(duplicate)).candidateIssueNumber,null);
  assert.ok(!duplicate.events.includes("POST issues"));

  const bot=setup({reporter:{login:"eplus-bot",type:"User",id:10}});
  assert.equal((await run(bot)).outcome,"ignored");
  assert.ok(!bot.events.includes("POST issues"));

  const broken=setup({failCreate:true});
  await assert.rejects(run(broken),/HTTP 500/);
  assert.ok(!broken.events.includes("POST issues/55/comments"));
});

test("original Share Code form remains canonical even if its title is edited",()=>{
  const form={number:93,title:"Get 30 billion Muse tokens.",state:"closed",
    body:"### Invite code\n\nD8190Y\n\n### Code source\n\nGitHub (my own code)\n\n### Contributor checklist\n\n- [X] consent"};
  const item={id:"community-issue-93",code:"D8190Y",feedbackIssueNumber:93};
  assert.equal(issueCode(form),"D8190Y");
  assert.equal(resolveExistingIssue(item,[form]),form);
  assert.equal(issueCode({...form,body:"### Invite code\n\nD8190Y"}),null);
});


test("multi-code form maps both independent records back to its single canonical Issue",async()=>{
  const form={number:120,title:"[Invite] two codes",state:"open",
    body:"### Invite code\n\nALFA12,\nBRAVO2\n\n### Code source\n\nGitHub (my own code)\n\n### Contributor checklist\n\n- [x] authorized"};
  const items=["ALFA12","BRAVO2"].map(code=>({
    id:"community-issue-120-"+code.toLowerCase(),code,feedbackIssueNumber:120
  }));
  assert.deepEqual(parseInviteCodes(" alfa12; BRAVO2 "),["ALFA12","BRAVO2"]);
  assert.deepEqual(issueCodes(form),["ALFA12","BRAVO2"]);
  assert.equal(issueCode(form),"ALFA12");
  assert.equal(resolveExistingIssue(items[0],[form]),form);
  assert.equal(resolveExistingIssue(items[1],[form]),form);
  const map=await syncCodeIssueMap(items,async()=>[form],async()=>{
    throw Error("Must not create a new Issue");
  });
  assert.deepEqual(map,{ALFA12:120,BRAVO2:120});
  assert.equal(feedbackCodeForIssue(form,items,"Code: BRAVO2\nResult: worked"),"BRAVO2");
  assert.equal(feedbackCodeForIssue(form,[items[1]]),"BRAVO2");
  assert.throws(()=>parseInviteCodes("ALFA12, ALFA12"),/distinct/);
});

test("canonical mapping is shared with comment PR handling for legacy owner records",()=>{
  const original=[{id:"eplus-owner-dpnihh",code:"DPNIHH"}];
  const mapped=withCanonicalIssueRefs(original,{DPNIHH:14});
  assert.equal(original[0].feedbackIssueNumber,undefined);
  assert.equal(mapped[0].feedbackIssueNumber,14);
  assert.equal(originalIssueNumber(mapped[0]),14);
  assert.deepEqual(withCanonicalIssueRefs(mapped,{DPNIHH:14}),mapped);
  assert.throws(()=>withCanonicalIssueRefs(mapped,{DPNIHH:44}),/Conflicting canonical/);
  assert.throws(()=>withCanonicalIssueRefs(original,{DPNIHH:-1}),/Invalid canonical/);
});


test("accept a pasted Muse referral message only when one explicit Code line exists",()=>{
  const pasted="Check out Muse, your personal AI agent. Redeem my code in Settings within 48 hours of joining and we'll both get 1 billion Muse tokens.\n\nCode: 8IJ5BD";
  assert.deepEqual(parseInviteCodes(pasted),["8IJ5BD"]);
  assert.deepEqual(parseInviteCodes("Code: 8ij5bd"),["8IJ5BD"]);
  assert.deepEqual(parseInviteCodes("Invite code: 8IJ5BD"),["8IJ5BD"]);
  const full={number:167,title:"8IJ5BD",state:"open",body:[
    "### Invite code","",pasted,"","### Code source","","GitHub (my own code)","",
    "### Contributor checklist","","- [x] I own this public code or am reporting a code explicitly shared publicly at the source URL above; this issue is public.",
    "- [x] This code is not a password, 2FA code, session token or private credential."
  ].join("\n")};
  assert.deepEqual(issueCodes(full),["8IJ5BD"]);
  for(const invalid of [
    "Check out Muse — redeem ABC123", // no explicit label
    "Code: ABC123\nCode: XYZ789", // ambiguous two labels
    "Use my code: ABC123", // not a standalone label
    "Code: 12\nRedeem now", // invalid code length
    "Code: ABC123, XYZ789", // unclear multiple codes
    "Code: ABC123\nCode: ABC123" // duplicates must not collapse
  ]) assert.throws(()=>parseInviteCodes(invalid),/Invite code must contain/);
});


test("Issue #219 Spanish referral paste extracts the single explicit Código code safely",()=>{
  const pasted=[
    "Echa un vistazo a Muse, tu agente de IA personal. Canjea mi código en la configuración dentro de las 48 horas posteriores a unirte.",
    "",
    "Código: 4WEZN6",
    "https://muse.ai/join"
  ].join("\n");
  assert.deepEqual(parseInviteCodes(pasted),["4WEZN6"]);
  for (const label of ["Código", "código", "CÓDIGO", "Codigo", "CODIGO"]) {
    assert.deepEqual(parseInviteCodes(label+": 4wezn6"),["4WEZN6"]);
  }
  const issue219={number:219,title:"[Invite] Código: 4WEZN6",state:"open",body:[
    "### Invite code","",pasted,"",
    "### Code source","","GitHub (my own code)","",
    "### Contributor checklist","",
    "- [x] I own this public code or am reporting a code explicitly shared publicly at the source URL above; this issue is public.",
    "- [x] This code is not a password, 2FA code, session token or private credential."
  ].join("\n")};
  assert.deepEqual(issueCodes(issue219),["4WEZN6"]);
  assert.equal(issueCode(issue219),"4WEZN6");
  assert.deepEqual(issueCodes({...issue219,title:"Misleading Title XYZ789"}),["4WEZN6"]);
});

test("Spanish referral parsing stays fail-closed for ambiguous or malformed labels",()=>{
  for (const invalid of [
    "Código: ABC123\nCode: XYZ789",
    "Código: ABC123\nCódigo: ABC123",
    "Código: ABC123, XYZ789",
    "Código: ABC-12",
    "Código: ABCDE",
    "Código: ABCDEFG",
    "Código: ABC123 trailing text",
    "Mi código es ABC123\nhttps://muse.ai/join",
    "Code: ABC123\nCódigo: XYZ789",
    "Código: ABC123\nCódigo: ABCDE"
  ]) assert.throws(()=>parseInviteCodes(invalid),/Invite code must contain/);
});

test("Muse invite field uses exactly six letters or digits, with uppercase normalization",()=>{
  assert.deepEqual(parseInviteCodes("ab12c3"),["AB12C3"]);
  assert.deepEqual(parseInviteCodes("ab12c3, DE45F6"),["AB12C3","DE45F6"]);
  assert.deepEqual(parseInviteCodes("Code: ab12c3"),["AB12C3"]);
  for(const invalid of ["ABCDE","ABCDEFG","ABC-12","AB_123","ABC 12","Code: ABC-12","Code: ABCDE","Code: ABCDEFG"]){
    assert.throws(()=>parseInviteCodes(invalid),/6-character/);
  }
  assert.throws(()=>issueMarker("ABC-12"),/Invalid invite code/);
  assert.deepEqual(issueCodes({...oldIssue,body:"### Invite code\n\nABC-12"}),[]);
});
