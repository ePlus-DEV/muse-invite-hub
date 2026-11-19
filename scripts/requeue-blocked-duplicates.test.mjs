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

// Regression: #363 was blocked by #364 for the identical Telegram source
// while the canonical Issue #362 was still awaiting publication.
const telegramCode="W9ENY3";
const telegramCatalog=[{
  id:"community-issue-362",code:telegramCode,feedbackIssueNumber:362,
  sourceUrl:"https://t.me/Betterbest222",status:"unverified"
}];
const telegramBody=[
  "### Invite code",telegramCode,
  "### Code source","Telegram (community code shared through bot)",
  "### Social post or profile URL (required for Threads, X or Facebook)","_No response_",
  "### Public confirmation or context (optional)","https://t.me/Betterbest222",
  "### Remaining invites (optional; self-reported)","_No response_",
  "### Notes (optional)",
  "Submitted via Telegram by @Betterbest222. Community report; public profile is not proof of code ownership, redemption or quota.",
  "### Contributor checklist",
  "- [x] I am authorized to share this code publicly; I understand this Issue is public.\\n"+
  "- [x] This code is not a password, 2FA code, session token or private credential.",
  "<!-- muse-telegram-submission:W9ENY3 -->"
].join("\\n\\n");
const telegramIssue=(overrides={})=>issue({
  number:363,title:"[Invite] W9ENY3",user:{login:"hoangsvit"},
  created_at:"2026-11-19T14:01:40Z",body:telegramBody,...overrides
});
const telegramConflict={...conflict,
  body:conflict.body.replace("/pull/298","/pull/364")};

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


test("Issue #363 requeues only the same trusted Telegram profile as published #362",()=>{
  assert.deepEqual(retryableDuplicate(telegramIssue(),telegramCatalog),
    {issueNumber:363,code:"W9ENY3",original:362});
  assert.equal(wasBlockedByOverlappingPr([telegramConflict]),true);
  const invalid=[
    telegramIssue({user:{login:"unrecognized-reporter"}}),
    telegramIssue({body:telegramBody.replace("https://t.me/Betterbest222","https://t.me/OtherUser123")}),
    telegramIssue({body:telegramBody.replace("@Betterbest222","@DifferentUser")}),
    telegramIssue({body:telegramBody.replace("- [x] I am authorized","- [ ] I am authorized")}),
    telegramIssue({body:telegramBody.replace("<!-- muse-telegram-submission:W9ENY3 -->","")}),
    telegramIssue({body:telegramBody.replace("_No response_","12")}),
    telegramIssue({state:"closed"}),
    telegramIssue({number:362})
  ];
  for(const item of invalid){
    assert.equal(retryableDuplicate(item,telegramCatalog),null);
  }
  assert.equal(retryableDuplicate(telegramIssue(),[
    {...telegramCatalog[0],sourceUrl:"https://t.me/AnotherUser"}
  ]),null);
  assert.equal(retryableDuplicate(telegramIssue(),[
    {...telegramCatalog[0],id:"unrelated-id"}
  ]),null);
  assert.equal(retryableDuplicate(telegramIssue(),[
    {...telegramCatalog[0],feedbackIssueNumber:999}
  ]),null);
});

test("post-deploy replays blocked Telegram #363 through existing safe Issue workflow",async()=>{
  const writes=[];
  const request=async (raw,options={})=>{
    const url=new URL(raw),op=(options.method||"GET")+" "+url.pathname;
    if(op==="GET /repos/"+repo+"/issues"){
      assert.equal(url.searchParams.get("state"),"open");
      return Response.json([telegramIssue()]);
    }
    if(op==="GET /repos/"+repo+"/issues/363/comments")
      return Response.json([telegramConflict]);
    if(op==="POST /repos/"+repo+"/actions/workflows/issue-to-pr.yml/dispatches"){
      assert.deepEqual(JSON.parse(options.body),
        {ref:"main",inputs:{issue_number:"363"}});
      writes.push(op);
      return new Response(null,{status:204});
    }
    throw Error("Unexpected request "+op);
  };
  const summary=await requeueBlockedDuplicates({
    token:"test-token",repository:repo,deployedSha:sha,request,
    records:telegramCatalog
  });
  assert.deepEqual(summary,{scanned:1,eligible:1,dispatched:1});
  assert.equal(writes.length,1);
});
