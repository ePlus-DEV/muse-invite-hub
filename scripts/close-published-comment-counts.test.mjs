import test from "node:test";
import assert from "node:assert/strict";
import {
  commentCountCandidate, matchesPublishedQuota, sameQuota, closePublishedCommentCounts
} from "./close-published-comment-counts.mjs";

const repo="ePlus-DEV/muse-invite-hub", code="DPNIHH", commentId=6889445306;
const merged="a".repeat(40), deployed="b".repeat(40);
const record={
  id:"eplus-owner-dpnihh",code,submittedBy:"hoangsvit",submittedById:11882322,
  feedbackIssueNumber:14,reportedCapacity:30,reportedUses:7,usageReportedAt:"2026-11-15"
};
const comment={
  id:commentId,user:{login:"hoangsvit",id:11882322},created_at:"2026-11-15T05:00:00Z",
  issue_url:"https://api.github.com/repos/"+repo+"/issues/14",
  body:"Code: DPNIHH\nUpdate type: Owner count\nRemaining invites: 23\nTotal invites: 30\n"+
    "Used invites: 7\nOwner confirmation: I confirm these figures came from my own Muse invite screen."
};
const pr={
  number:157,title:"data: review DPNIHH count from comment #"+commentId,
  body:"## Community feedback — requires human review\n\nOriginal Issue: #14\n"+
    "Source comment: https://github.com/"+repo+"/issues/14#issuecomment-"+commentId+"\n"+
    "Reporter: @hoangsvit\nCode: **DPNIHH**\nAction: update quota\n",
  head:{ref:"auto/comment-14-"+commentId+"-count",repo:{full_name:repo}},
  base:{ref:"main"},user:{login:"github-actions[bot]"},
  merged_at:"2026-11-15T06:00:19Z",merge_commit_sha:merged
};
const html='<title>DPNIHH Muse Invite Code | Muse Invite Hub</title>'+
  '<link rel="canonical" href="https://muse.eplus.dev/codes/DPNIHH/">';

function mock({pull=pr,source=comment,sources={},issueState="open",newHuman=false,
  live=true,liveRecord=record,mergedRecord=record,comparison="ahead",filePath,
  posted=false,failNotify=false,manualCompletion=false,guidancePosted=false,failGuidance=false}={}) {
  const events=[];
  const publishedPrNumber=Math.max(...(Array.isArray(pull)?pull:[pull]).map(row=>row.number));
  const issue={number:14,state:issueState,body:"### Invite code\n\nDPNIHH"};
  const comments=[
    source,
    ...(manualCompletion?[{id:commentId+50,user:{login:"hoangsvit",type:"User"},
      body:"<!-- muse-manual-published-owner-count:"+publishedPrNumber+" -->\\n**Code:** DPNIHH\\n[PR #"+publishedPrNumber+"]"}]:[]),
    ...(newHuman?[{id:commentId+100,user:{login:"another-human",type:"User"},
      body:typeof newHuman==="string"?newHuman:"New report"}]:[]),
    ...(guidancePosted?[{id:commentId+200,user:{login:"github-actions[bot]",type:"Bot"},
      body:"<!-- muse-unrelated-referral:"+(commentId+100)+" -->"}]:[]),
    ...(posted?[{id:commentId+300,user:{login:"github-actions[bot]"},
      body:"<!-- muse-published-comment-pr:"+publishedPrNumber+" -->"}]:[])
  ];
  async function request(raw,options={}) {
    const url=new URL(raw),method=options.method||"GET";
    if(url.host==="muse.eplus.dev"){
      events.push("live:"+url.pathname);
      if(url.pathname==="/data/invites.json"){
        return {ok:live,json:async()=>[liveRecord]};
      }
      return {ok:live,text:async()=>live?html:""};
    }
    assert.equal(url.host,"api.github.com");
    assert.match(options.headers.Authorization,/^Bearer /);
    const path=url.pathname.replace("/repos/"+repo+"/","");
    events.push(method+" "+path);
    let data;
    if(method==="GET" && path==="pulls")data=url.searchParams.get("page")==="1"?(Array.isArray(pull)?pull:[pull]):[];
    else if(method==="GET" && path==="issues/14")data=issue;
    else if(method==="GET" && path.startsWith("issues/comments/"))
      data=sources[Number(path.split("/").at(-1))]||source;
    else if(method==="GET" && path==="issues/14/comments")data=comments;
    else if(method==="GET" && /^pulls\/[1-9]\d*\/files$/.test(path))data=[{
      filename:filePath||"data/invite-records/eplus-owner-dpnihh.json",status:"modified"
    }];
    else if(method==="GET" && path==="compare/"+merged+"..."+deployed)data={status:comparison};
    else if(method==="GET" && path==="contents/data/invite-records/eplus-owner-dpnihh.json")
      data={encoding:"base64",content:Buffer.from(JSON.stringify(mergedRecord)).toString("base64")};
    else if(method==="POST" && path==="issues/14/comments"){
      const body=JSON.parse(options.body).body;
      if(body.startsWith("<!-- muse-unrelated-referral:")){
        if(failGuidance)return {ok:false,status:500};
        assert.match(body,/Share Code Issue Form/);
        comments.push({id:commentId+500,user:{login:"github-actions[bot]",type:"Bot"},body});
        data={id:commentId+500};
        return {ok:true,status:200,json:async()=>data};
      }
      if(failNotify)return {ok:false,status:500};
      assert.ok(body.includes("<!-- muse-published-comment-pr:"+publishedPrNumber+" -->"));
      assert.match(body,/https:\/\/muse\.eplus\.dev\/codes\/DPNIHH\//);
      assert.match(body,/not live Muse availability/);
      comments.push({id:999,user:{login:"github-actions[bot]"},body});
      data={id:999};
    }else if(method==="PATCH" && path==="issues/14"){
      assert.ok(comments.some(x=>x.body?.includes("<!-- muse-published-comment-pr:"+publishedPrNumber+" -->")));
      assert.deepEqual(JSON.parse(options.body),{state:"closed",state_reason:"completed"});
      issue.state="closed";data=issue;
    }else throw Error("Unexpected "+method+" "+path+url.search);
    return {ok:true,status:200,json:async()=>data};
  }
  return {request,issue,events,comments};
}

async function run(m,chosenRecord=record) {
  return closePublishedCommentCounts({token:"test",repository:repo,deployedSha:deployed,
    request:m.request,catalog:[chosenRecord],mapping:{DPNIHH:14}});
}

test("accept only strictly attributable, merged, bot-authored count-comment PRs",()=>{
  assert.deepEqual(commentCountCandidate(pr),{
    issueNumber:14,commentId,code,prNumber:157,mergeSha:merged,
    provenance:"auto",allowNarrative:false
  });
  assert.ok(commentCountCandidate({...pr,user:{login:"eplus-bot"}}));
  for(const change of [
    {merged_at:null},{user:{login:"random-user"}},
    {base:{ref:"staging"}},{head:{ref:"auto/comment-14-6889445306-feedback",repo:{full_name:repo}}},
    {body:"Closes #14"},{merge_commit_sha:null}
  ])assert.equal(commentCountCandidate({...pr,...change}),null);
});

test("recognize PR #220's real manual owner-count review provenance",()=>{
  const pr220={
    number:220,
    title:"data: review YKDCA9 owner count from issue #204 (30 total, 29 remaining)",
    body:[
      "## Owner-reported quota update — Issue #204",
      "Source: [@JackChong1's comment](https://github.com/ePlus-DEV/muse-invite-hub/issues/204#issuecomment-6934787451) on 2026-11-17 (UTC).",
      "Existing invite code: **YKDCA9**. Previously published through merged PR #205.",
      "Tracks Issue #204 and comment #6934787451."
    ].join("\n"),
    user:{login:"hoangsvit"},
    head:{ref:"review/issue-204-owner-count-20261117",repo:{full_name:repo}},
    base:{ref:"main"},merged_at:"2026-11-17T01:37:08Z",
    merge_commit_sha:merged
  };
  assert.deepEqual(commentCountCandidate(pr220),{
    issueNumber:204,commentId:6934787451,code:"YKDCA9",prNumber:220,mergeSha:merged,
    provenance:"maintainer",allowNarrative:true
  });
  for(const change of [
    {user:{login:"untrusted-contributor"}},
    {merged_at:null},
    {body:pr220.body.replace("Tracks Issue #204","Tracks Issue #205")},
    {body:pr220.body.replace("Existing invite code: **YKDCA9**.","Existing invite code: **OTHER1**.")},
    {body:pr220.body.replace("#issuecomment-6934787451","#issuecomment-6934787451")+
      "\nhttps://github.com/ePlus-DEV/muse-invite-hub/issues/204#issuecomment-6934787451"},
    {body:pr220.body.replace("/issues/204#","/issues/205#")},
    {title:"data: review OTHER1 owner count from issue #204"},
    {base:{ref:"dev"}}
  ])assert.equal(commentCountCandidate({...pr220,...change}),null);
  const reported={
    id:"community-issue-204",code:"YKDCA9",submittedBy:"JackChong1",
    submittedById:123796417,feedbackIssueNumber:204,
    reportedCapacity:30,reportedUses:1,usageReportedAt:"2026-11-17"
  };
  const source={
    id:6934787451,created_at:"2026-11-17T01:20:21Z",
    user:{login:"JackChong1",id:123796417},
    body:"Owner count update — YKDCA9\n\n- Total invites: 30\n- Remaining invites: 29\n- Used invites: 1\n\n"+
      "I am the owner of this invite code. One friend redeemed the code on 2026-11-16, so 29 uses remain."
  };
  assert.equal(matchesPublishedQuota(source,reported),false);
  assert.equal(matchesPublishedQuota(source,reported,{allowNarrative:true}),true);
  for(const changed of [
    {user:{login:"JackChong1",id:999}},
    {body:source.body.replace("Remaining invites: 29","Remaining invites: 28")},
    {body:source.body.replace("Used invites: 1","Used invites: two")},
    {body:source.body.replace("- Used invites: 1","- Used invites: 1\n- Used invites: 1")},
    {body:source.body.replace("I am the owner of this invite code.","")},
    {created_at:"2026-11-16T01:20:21Z"}
  ])assert.equal(matchesPublishedQuota({...source,...changed},reported,{allowNarrative:true}),false);
});

test("new bot-created narrative count proposals can close after a trusted merge",()=>{
  const body=pr.body.replace("Action: update quota","Action: review owner-reported count");
  const narrativeBot={...pr,body};
  assert.equal(commentCountCandidate(narrativeBot)?.allowNarrative,true);
  assert.equal(commentCountCandidate({...narrativeBot,body:body.replace("review owner-reported count","unreviewed claim")}),null);
});

test("manual and automated reviewed narrative owner counts close only after live deployment",async()=>{
  const source={...comment,body:"Owner count update — DPNIHH\n\n- Total invites: 30\n"+
    "- Remaining invites: 23\n- Used invites: 7\n\n"+
    "I am the owner of this invite code. One friend redeemed this code."};
  const manual={
    ...pr,number:220,
    title:"data: review DPNIHH owner count from issue #14 (30 total, 23 remaining)",
    body:"## Owner-reported quota update — Issue #14\n"+
      "Source: [@hoangsvit's comment](https://github.com/ePlus-DEV/muse-invite-hub/issues/14#issuecomment-"+commentId+")\n"+
      "Existing invite code: **DPNIHH**.\nTracks Issue #14 and comment #"+commentId+".",
    head:{...pr.head,ref:"review/issue-14-owner-count"},
    user:{login:"hoangsvit"}
  };
  const m=mock({pull:manual,source});
  assert.deepEqual(await run(m),{notified:1,closed:1,pending:0,skipped:0});
  assert.equal(m.issue.state,"closed");
  assert.ok(m.events.indexOf("live:/data/invites.json")<m.events.indexOf("POST issues/14/comments"));
  assert.ok(m.events.indexOf("POST issues/14/comments")<m.events.indexOf("PATCH issues/14"));
  const rerun=mock({pull:manual,source,issueState:"closed"});
  assert.deepEqual(await run(rerun),{notified:0,closed:0,pending:0,skipped:1});
  for(const option of [{live:false},{newHuman:true},{comparison:"behind"},
    {mergedRecord:{...record,reportedUses:8}},{liveRecord:{...record,reportedUses:8}}]) {
    const bad=mock({pull:manual,source,...option});
    assert.equal((await run(bad)).closed,0);
    assert.ok(!bad.events.includes("PATCH issues/14"));
  }
  const bot={...pr,body:pr.body.replace("Action: update quota","Action: review owner-reported count")};
  const automated=mock({pull:bot,source});
  assert.equal((await run(automated)).closed,1);
});

test("auto-triage an unrelated new invite comment before closing a reviewed owner count",async()=>{
  const source={...comment,body:"Owner count update — DPNIHH\n\n- Total invites: 30\n"+
    "- Remaining invites: 23\n- Used invites: 7\n\nI am the owner of this invite code."};
  const manual={...pr,number:220,
    title:"data: review DPNIHH owner count from issue #14 (30 total, 23 remaining)",
    body:"Source: [@hoangsvit's comment](https://github.com/ePlus-DEV/muse-invite-hub/issues/14#issuecomment-"+commentId+")\n"+
      "Existing invite code: **DPNIHH**.\nTracks Issue #14 and comment #"+commentId+".",
    head:{...pr.head,ref:"review/issue-14-owner-count"},
    user:{login:"hoangsvit"}};
  const unrelated="快来看看你的个人 AI 智能体 Muse 。\n邀请码：MIN0OF\nhttps://muse.ai/join";
  const m=mock({pull:manual,source,newHuman:unrelated,manualCompletion:true});
  assert.deepEqual(await run(m),{notified:1,closed:1,pending:0,skipped:0});
  assert.ok(m.comments.some(c=>String(c.body).includes("<!-- muse-unrelated-referral:"+(commentId+100)+" -->")));
  const posts=m.events.map((v,i)=>({v,i})).filter(x=>x.v==="POST issues/14/comments");
  assert.equal(posts.length,2,"one guidance then one completion comment");
  assert.ok(posts[1].i>posts[0].i);
  assert.ok(m.events.indexOf("PATCH issues/14")>posts[1].i);

  const alreadyGuided=mock({pull:manual,source,newHuman:unrelated,manualCompletion:true,guidancePosted:true});
  assert.equal((await run(alreadyGuided)).closed,1);
  assert.equal(alreadyGuided.events.filter(v=>v==="POST issues/14/comments").length,1);
  const failedGuidance=mock({pull:manual,source,newHuman:unrelated,failGuidance:true});
  await assert.rejects(run(failedGuidance),/HTTP 500/);
  assert.ok(!failedGuidance.events.includes("PATCH issues/14"));

  for(const body of [
    "I tried DPNIHH and it failed.",
    "Code: MIN0OF\nResult: not working",
    "邀请码：MIN0OF\n邀请码：OTHER1\nhttps://muse.ai/join",
    "邀请码：DPNIHH\nhttps://muse.ai/join"
  ]) {
    const pending=mock({pull:manual,source,newHuman:body,manualCompletion:true});
    assert.equal((await run(pending)).closed,0);
    assert.ok(!pending.events.includes("PATCH issues/14"));
  }
});

test("match only the owner-confirmed source comment and exact dated count",()=>{
  assert.equal(matchesPublishedQuota(comment,record),true);
  for(const change of [
    {user:{login:"another",id:11882322}},
    {user:{login:"hoangsvit",id:99}},
    {body:comment.body.replace("Remaining invites: 23","Remaining invites: 22")},
    {body:comment.body.replace("Owner confirmation: I confirm these figures came from my own Muse invite screen.","Owner confirmation: ok")},
    {created_at:"2026-11-14T05:00:00Z"}
  ])assert.equal(matchesPublishedQuota({...comment,...change},record),false);
  assert.equal(sameQuota(record,{...record,reportedUses:8}),false);
  assert.equal(matchesPublishedQuota({...comment,body:comment.body.replace("23","0").replace("Used invites: 7","Used invites: 30")},
    {...record,reportedUses:30}),true);
});

test("after live quota confirmation, comment with detail URL before closing Issue #14",async()=>{
  const m=mock();
  assert.deepEqual(await run(m),{notified:1,closed:1,pending:0,skipped:0});
  assert.equal(m.issue.state,"closed");
  assert.ok(m.events.indexOf("live:/data/invites.json")<
    m.events.indexOf("POST issues/14/comments"));
  assert.ok(m.events.indexOf("POST issues/14/comments")<
    m.events.indexOf("PATCH issues/14"));
});

test("reruns don't duplicate acceptance notification; already closed stays closed",async()=>{
  const m=mock({posted:true});
  assert.deepEqual(await run(m),{notified:0,closed:1,pending:0,skipped:0});
  assert.ok(!m.events.includes("POST issues/14/comments"));
  const closed=mock({issueState:"closed"});
  assert.deepEqual(await run(closed),{notified:0,closed:0,pending:0,skipped:1});
});

test("new human report keeps the canonical Issue open even when earlier count was published",async()=>{
  const m=mock({newHuman:true});
  assert.deepEqual(await run(m),{notified:0,closed:0,pending:1,skipped:0});
  assert.equal(m.issue.state,"open");
  assert.ok(!m.events.includes("PATCH issues/14"));
});

test("stale, missing, mismatched or unpublished data cannot close canonical Issue",async()=>{
  for(const options of [
    {live:false},{comparison:"behind"},{liveRecord:{...record,reportedUses:6}},
    {mergedRecord:{...record,reportedUses:6}},
    {source:{...comment,body:comment.body.replace("23","22")}},
    {filePath:"README.md"}
  ]){
    const m=mock(options);
    const result=await run(m);
    assert.equal(result.closed,0);
    assert.equal(result.pending,1);
    assert.ok(!m.events.includes("PATCH issues/14"));
  }
  const m=mock();
  assert.equal((await run(m,{...record,feedbackIssueNumber:19})).closed,0);
});

test("a stale older merged PR cannot hide the newest reviewed owner-count update",async()=>{
  const previousId=commentId-1;
  const oldSource={...comment,id:previousId,
    body:comment.body.replace("Remaining invites: 23","Remaining invites: 3")
      .replace("Used invites: 7","Used invites: 27")};
  const oldPr={...pr,number:100,
    title:"data: review DPNIHH count from comment #"+previousId,
    body:pr.body.replaceAll(String(commentId),String(previousId)),
    head:{...pr.head,ref:"auto/comment-14-"+previousId+"-count"}};
  // GitHub sorts by updated time; the older PR can be listed first.
  const m=mock({pull:[oldPr,pr],sources:{[previousId]:oldSource}});
  const result=await run(m);
  assert.deepEqual(result,{notified:1,closed:1,pending:1,skipped:0});
  assert.equal(m.issue.state,"closed");
});

test("failure to post acceptance comment prevents closure",async()=>{
  const m=mock({failNotify:true});
  await assert.rejects(run(m),/GitHub POST issues\/14\/comments: HTTP 500/);
  assert.ok(!m.events.includes("PATCH issues/14"));
});

test("trusted repository and deployed SHA are mandatory",async()=>{
  const m=mock();
  await assert.rejects(closePublishedCommentCounts({token:"test",repository:"other/repo",
    deployedSha:deployed,request:m.request,catalog:[record],mapping:{DPNIHH:14}}),/Trusted repository/);
  await assert.rejects(closePublishedCommentCounts({token:"test",repository:repo,
    deployedSha:"main",request:m.request,catalog:[record],mapping:{DPNIHH:14}}),/Trusted repository/);
});
