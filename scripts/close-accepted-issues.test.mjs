import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptedCandidate, acceptanceComment, closeAcceptedIssues
} from "./close-accepted-issues.mjs";

const repo="ePlus-DEV/muse-invite-hub", code="ALFA12";
const merged="a".repeat(40), deployed="b".repeat(40);
const pr=(overrides={})=>({
  number:91, title:"data: review ALFA12 invite (issue #90)",
  body:"## Automated draft proposal\nPrepared from public Issue #90 by @contributor.\nCode: **ALFA12**. Change: **add**.",
  merged_at:"2026-11-12T00:00:00Z",merge_commit_sha:merged,
  head:{ref:"auto/issue-90-invite",repo:{full_name:repo}},
  base:{ref:"main"},user:{login:"github-actions[bot]"},...overrides
});
const issue=(overrides={})=>({
  number:90,state:"open",title:"[Invite] ALFA12",
  body:"### Invite code\n\nALFA12\n\n### Code source\n\nGitHub (my own code)",
  ...overrides
});
const html=(target=code)=>'<!doctype html><html><head><title>'+target+
  ' Muse Invite Code | Muse Invite Hub</title><link rel="canonical" href="https://muse.eplus.dev/codes/'+target+
  '/"></head><body>Community-shared, unverified.</body></html>';

function mock({pull=pr(),posted=false,reopened=false,live=true,comparison="ahead",initialIssue=issue(),
  failComment=false,files=[{filename:"data/invites.json"}]}={}) {
  const events=[], savedIssue=structuredClone(initialIssue);
  let accepted=posted;
  async function request(rawUrl,options={}) {
    const url=new URL(rawUrl), method=options.method || "GET";
    if (url.host==="muse.eplus.dev") {
      events.push("live");
      return {ok:live,status:live?200:404,text:async()=>live?html():"404"};
    }
    assert.equal(url.host,"api.github.com");
    assert.match(options.headers.Authorization,/^Bearer /);
    const path=url.pathname.replace("/repos/"+repo+"/","");
    const op=method+" "+path;
    events.push(op);
    let data;
    if(method==="GET" && path==="pulls") data=url.searchParams.get("page")==="1"?[pull]:[];
    else if(op==="GET issues/90") data=savedIssue;
    else if(op==="GET pulls/91/files") data=files;
    else if(op==="GET compare/"+merged+"..."+deployed) data={status:comparison};
    else if(op==="GET issues/90/comments") data=[
      ...(accepted?[{user:{login:"github-actions[bot]"},
        body:"<!-- muse-accepted-contribution -->"}]:[]),
      ...(reopened?[{user:{login:"github-actions[bot]"},
        body:"<!-- muse-code-feedback-reopened -->"}]:[])
    ];
    else if(op==="POST issues/90/comments") {
      if(failComment) return {ok:false,status:500,text:async()=>"failure"};
      const body=JSON.parse(options.body).body;
      assert.match(body,/https:\/\/muse.eplus.dev\/codes\/ALFA12\//);
      assert.match(body,/does \*\*not\*\* mean Muse has verified/);
      accepted=true;
      data={id:7};
    } else if(op==="PATCH issues/90") {
      assert.equal(accepted,true,"never close Issue before commenting");
      assert.deepEqual(JSON.parse(options.body),{state:"closed",state_reason:"completed"});
      savedIssue.state="closed";data=savedIssue;
    } else throw Error("Unexpected mock request "+op+"?"+url.search);
    return {ok:true,status:200,json:async()=>data};
  }
  return {request,events,issue:savedIssue};
}

test("only merged bot PRs with trusted Issue provenance qualify",()=>{
  assert.deepEqual(acceptedCandidate(pr()),{
    issueNumber:90,kind:"invite",code,prNumber:91,mergeSha:merged
  });
  assert.equal(acceptedCandidate(pr({merged_at:null})),null);
  assert.equal(acceptedCandidate(pr({head:{ref:"auto/issue-90-invite",repo:{full_name:"someone/other"}}})),null);
  assert.equal(acceptedCandidate(pr({user:{login:"malicious-user"}})),null);
  assert.equal(acceptedCandidate(pr({base:{ref:"staging"}})),null);
  assert.equal(acceptedCandidate(pr({body:"Closes #90"})),null);
  assert.equal(acceptedCandidate(pr({head:{ref:"feature/issue-90-invite",repo:{full_name:repo}}})),null);
  assert.match(acceptanceComment({code,prNumber:91}),/View ALFA12/);
  assert.match(acceptanceComment({code,prNumber:91}),/does \*\*not\*\* mean Muse has verified/);
});

test("after deployed merge and live detail verification, comment comes before close",async()=>{
  const m=mock();
  const result=await closeAcceptedIssues({
    request:m.request,token:"test-token",repository:repo,deployedSha:deployed,catalog:[{code}]
  });
  assert.deepEqual(result,{notified:1,closed:1,pending:0,skipped:0});
  const commentIndex=m.events.indexOf("POST issues/90/comments");
  const closeIndex=m.events.indexOf("PATCH issues/90");
  assert.ok(commentIndex>0 && closeIndex>commentIndex);
  assert.ok(m.events.indexOf("live")<commentIndex);
  assert.equal(m.issue.state,"closed");
});

test("an already posted acceptance comment is not duplicated on retry",async()=>{
  const m=mock({posted:true});
  const result=await closeAcceptedIssues({
    request:m.request,token:"test-token",deployedSha:deployed,catalog:[{code}]
  });
  assert.deepEqual(result,{notified:0,closed:1,pending:0,skipped:0});
  assert.ok(!m.events.includes("POST issues/90/comments"));
  assert.ok(m.events.includes("PATCH issues/90"));
});

test("new feedback on a previously accepted Issue survives future deployments",async()=>{
  const m=mock({posted:true,reopened:true});
  const result=await closeAcceptedIssues({
    request:m.request,token:"test-token",deployedSha:deployed,catalog:[{code}]
  });
  assert.equal(result.closed,0);
  assert.equal(result.skipped,1);
  assert.ok(!m.events.includes("PATCH issues/90"));
});

test("unpublished, wrong-code, unverified merge, stale site and unrelated file changes never close",async()=>{
  for(const settings of [
    {catalog:[],config:{}},
    {catalog:[{code}],config:{comparison:"behind"}},
    {catalog:[{code}],config:{live:false}},
    {catalog:[{code}],config:{files:[{filename:"README.md"}]}},
    {catalog:[{code}],config:{initialIssue:issue({body:"### Invite code\n\nOTHER1"})}}
  ]) {
    const m=mock(settings.config);
    const result=await closeAcceptedIssues({
      request:m.request,token:"test-token",deployedSha:deployed,catalog:settings.catalog
    });
    assert.equal(result.closed,0);
    assert.equal(result.notified,0);
    assert.equal(result.pending,1);
    assert.ok(!m.events.includes("PATCH issues/90"));
  }
});

test("closed Issues and unmerged PRs are ignored without publishing a comment",async()=>{
  const m=mock({initialIssue:issue({state:"closed"})});
  const result=await closeAcceptedIssues({
    request:m.request,token:"test-token",deployedSha:deployed,catalog:[{code}]
  });
  assert.equal(result.skipped,1);
  assert.equal(result.closed,0);
  const n=mock({pull:pr({merged_at:null})});
  const out=await closeAcceptedIssues({
    request:n.request,token:"test-token",deployedSha:deployed,catalog:[{code}]
  });
  assert.equal(out.closed,0);
  assert.ok(!n.events.some(x=>x.startsWith("GET issues/90")));
});

test("comment API failure does not close accepted Issue",async()=>{
  const m=mock({failComment:true});
  await assert.rejects(closeAcceptedIssues({
    request:m.request,token:"test-token",deployedSha:deployed,catalog:[{code}]
  }),/GitHub API POST issues\/90\/comments/);
  assert.ok(!m.events.includes("PATCH issues/90"));
});

test("refuses write access without the expected repository and deployed SHA",async()=>{
  await assert.rejects(closeAcceptedIssues({token:"test",deployedSha:deployed,repository:"untrusted/repo"}),/Expected trusted/);
  await assert.rejects(closeAcceptedIssues({token:"test",deployedSha:"main"}),/Expected trusted/);
});
