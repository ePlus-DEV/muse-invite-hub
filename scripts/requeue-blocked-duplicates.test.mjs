import test from "node:test";
import assert from "node:assert/strict";
import {
  retryableDuplicate,wasBlockedByOverlappingPr,requeueBlockedDuplicates
} from "./requeue-blocked-duplicates.mjs";

const code="AUYL1M";
const catalog=[{id:"community-issue-297",code,feedbackIssueNumber:297,
  sourceUrl:"https://t.me/Metalker",status:"unverified"}];
const body=[
  "### Invite code",code,
  "### Code source","GitHub (my own code)",
  "### Social post or profile URL (required for Threads, X or Facebook)","_No response_",
  "### Invite limit (optional; self-reported)","_No response_",
  "### Uses so far (optional; self-reported)","_No response_",
  "### Remaining invites (optional; self-reported)","_No response_",
  "### Contributor checklist",
  "- [x] I am authorized to share this code publicly; I understand this Issue is public.\n"+
  "- [x] This code is not a password, 2FA code, session token or private credential."
].join("\n\n");
const issue=(overrides={})=>({
  number:299,title:"[Invite]",state:"open",body,user:{login:"zzzz1202"},...overrides
});
const conflict={
  user:{login:"eplus-bot"},
  body:"<!-- muse-issue-draft-pr -->\nNo automatic Draft PR was created for this Issue: "+
  "Another open automated PR already changes one of these codes: "+
  "https://github.com/ePlus-DEV/muse-invite-hub/pull/298. A maintainer can review the report manually."
};
const sha="a".repeat(40);
const repo="ePlus-DEV/muse-invite-hub";

test("Issue #299 becomes a requeue candidate after the canonical Telegram record is published",()=>{
  assert.deepEqual(retryableDuplicate(issue(),catalog),
    {issueNumber:299,code,original:297});
  assert.equal(wasBlockedByOverlappingPr([conflict]),true);
  assert.equal(wasBlockedByOverlappingPr([
    {...conflict,user:{login:"random-contributor"}}
  ]),false);
  assert.equal(wasBlockedByOverlappingPr([
    {...conflict,body:"<!-- muse-issue-draft-pr --> Updated PR #298"}
  ]),false);
});

test("never requeue ambiguous source claims, owner quotas, incomplete consent or canonical Issues",()=>{
  const invalid=[
    issue({state:"closed"}),
    issue({pull_request:{url:"https://github.com/example"}}),
    issue({body:body.replace("GitHub (my own code)","Telegram (community code shared through bot)")}),
    issue({body:body.replace(
      "### Invite limit (optional; self-reported)\n\n_No response_",
      "### Invite limit (optional; self-reported)\n\n12"
    )}),
    issue({body:body.replace(
      "### Social post or profile URL (required for Threads, X or Facebook)\n\n_No response_",
      "### Social post or profile URL (required for Threads, X or Facebook)\n\nhttps://t.me/Other"
    )}),
    issue({body:body.replace("- [x] I am authorized","- [ ] I am authorized")}),
    issue({body:body.replace(code,"ANOTHER")}),
    issue({number:297})
  ];
  for(const item of invalid)
    assert.equal(retryableDuplicate(item,catalog),null);
  assert.equal(retryableDuplicate(issue(),[]),null);
  assert.equal(retryableDuplicate(issue(),[{code,id:"community-issue-299",feedbackIssueNumber:299}]),null);
});

test("after Pages deployment only the verified blocked duplicate is dispatched, never modified here",async()=>{
  const operations=[];
  const request=async (raw,options={})=>{
    const url=new URL(raw);
    assert.equal(url.hostname,"api.github.com");
    assert.match(options.headers.Authorization,/^Bearer /);
    const op=(options.method||"GET")+" "+url.pathname;
    operations.push(op);
    if(op==="GET /repos/"+repo+"/issues"){
      assert.equal(url.searchParams.get("state"),"open");
      return Response.json([issue(),issue({number:300,state:"closed"})]);
    }
    if(op==="GET /repos/"+repo+"/issues/299/comments"){
      return Response.json([conflict]);
    }
    if(op==="POST /repos/"+repo+"/actions/workflows/issue-to-pr.yml/dispatches"){
      assert.deepEqual(JSON.parse(options.body),
        {ref:"main",inputs:{issue_number:"299"}});
      return new Response(null,{status:204});
    }
    throw Error("Unexpected request "+op);
  };
  const result=await requeueBlockedDuplicates({
    token:"token-test",repository:repo,deployedSha:sha,records:catalog,request
  });
  assert.deepEqual(result,{scanned:2,eligible:1,dispatched:1});
  assert.ok(operations.every(x=>!x.includes("/comments")||x.startsWith("GET ")));
  assert.ok(operations.every(x=>!x.startsWith("PATCH ")&&!x.includes("/pulls")));
});

test("no blocked PR marker, unpublished code or missing trust context: no dispatch",async()=>{
  const ops=[];
  const request=async (raw,options)=>{
    const url=new URL(raw),path=url.pathname;
    ops.push((options.method||"GET")+" "+path);
    if(path.endsWith("/issues"))return Response.json([issue()]);
    if(path.endsWith("/issues/299/comments"))return Response.json([
      {user:{login:"eplus-bot"},body:"<!-- muse-issue-draft-pr --> No change"}
    ]);
    throw Error("Unexpected POST");
  };
  const summary=await requeueBlockedDuplicates({
    token:"token-test",repository:repo,deployedSha:sha,records:catalog,request
  });
  assert.equal(summary.dispatched,0);
  assert.equal(ops.length,2);
  await assert.rejects(requeueBlockedDuplicates({
    token:"token-test",repository:"untrusted/repo",deployedSha:sha,records:catalog,request
  }),/Trusted deployed repo/);
  await assert.rejects(requeueBlockedDuplicates({
    token:"token-test",repository:repo,deployedSha:"main",records:catalog,request
  }),/Trusted deployed repo/);
});
