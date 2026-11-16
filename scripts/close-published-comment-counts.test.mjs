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

function mock({pull=pr,source=comment,issueState="open",newHuman=false,
  live=true,liveRecord=record,mergedRecord=record,comparison="ahead",filePath,
  posted=false,failNotify=false}={}) {
  const events=[];
  const issue={number:14,state:issueState,body:"### Invite code\n\nDPNIHH"};
  const comments=[
    source,
    ...(newHuman?[{id:commentId+100,user:{login:"another-human",type:"User"},body:"New report"}]:[]),
    ...(posted?[{id:commentId+300,user:{login:"github-actions[bot]"},
      body:"<!-- muse-published-comment-pr:157 -->"}]:[])
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
    if(method==="GET" && path==="pulls")data=url.searchParams.get("page")==="1"?[pull]:[];
    else if(method==="GET" && path==="issues/14")data=issue;
    else if(method==="GET" && path==="issues/comments/"+commentId)data=source;
    else if(method==="GET" && path==="issues/14/comments")data=comments;
    else if(method==="GET" && path==="pulls/157/files")data=[{
      filename:filePath||"data/invite-records/eplus-owner-dpnihh.json",status:"modified"
    }];
    else if(method==="GET" && path==="compare/"+merged+"..."+deployed)data={status:comparison};
    else if(method==="GET" && path==="contents/data/invite-records/eplus-owner-dpnihh.json")
      data={encoding:"base64",content:Buffer.from(JSON.stringify(mergedRecord)).toString("base64")};
    else if(method==="POST" && path==="issues/14/comments"){
      if(failNotify)return {ok:false,status:500};
      const body=JSON.parse(options.body).body;
      assert.match(body,/<!-- muse-published-comment-pr:157 -->/);
      assert.match(body,/https:\/\/muse\.eplus\.dev\/codes\/DPNIHH\//);
      assert.match(body,/not live Muse availability/);
      comments.push({id:999,user:{login:"github-actions[bot]"},body});
      data={id:999};
    }else if(method==="PATCH" && path==="issues/14"){
      assert.ok(comments.some(x=>x.body?.includes("<!-- muse-published-comment-pr:157 -->")));
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
    issueNumber:14,commentId,code,prNumber:157,mergeSha:merged
  });
  assert.ok(commentCountCandidate({...pr,user:{login:"eplus-bot"}}));
  for(const change of [
    {merged_at:null},{user:{login:"random-user"}},
    {base:{ref:"staging"}},{head:{ref:"auto/comment-14-6889445306-feedback",repo:{full_name:repo}}},
    {body:"Closes #14"},{merge_commit_sha:null}
  ])assert.equal(commentCountCandidate({...pr,...change}),null);
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
