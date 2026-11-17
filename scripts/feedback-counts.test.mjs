import test from "node:test";
import assert from "node:assert/strict";
import { summarizeFeedback, fetchAllFeedbackComments } from "./feedback-counts.mjs";

const repo="https://api.github.com/repos/ePlus-DEV/muse-invite-hub/issues/";
const entries=[
  {code:"DPNIHH",feedbackIssueNumber:14},
  {code:"ALFA12",feedbackIssueNumber:77},
  {code:"BRAVO2",feedbackIssueNumber:77},
  {code:"EMPTY1"}
];
const map={DPNIHH:14,ALFA12:77,BRAVO2:77};
const createdAt="2026-11-17T08:00:00Z";
const report=(id,user,code,result,issue=14,stamp=createdAt)=>({
  id,created_at:stamp,
  issue_url:repo+issue,
  user:{id:user,login:"member-"+user,type:"User"},
  body:"Code: "+code+"\nResult: "+result+"\nWhen I tried: 2026-11-17"
});
const accepted="Muse accepted my code";
const rejected="Muse rejected or could not redeem my code";

test("counts only newest correctly formatted report per GitHub user and code",()=>{
  const replies=[
    report(1,11,"DPNIHH",accepted,14,"2026-11-15T10:00:00Z"),
    report(2,11,"DPNIHH",rejected,14,"2026-11-16T10:00:00Z"),
    report(3,12,"DPNIHH",accepted),
    report(4,12,"DPNIHH",accepted), // duplicate same user
    report(5,13,"ALFA12",accepted,77),
    report(6,13,"BRAVO2",rejected,77), // one user may report on two different codes
    report(7,13,"ALFA12",accepted,14), // wrong Issue should not count
    {...report(8,14,"DPNIHH",accepted),user:{id:14,login:"github-actions[bot]",type:"Bot"}},
    {...report(9,14,"DPNIHH",accepted),user:{id:14,login:"eplus-bot",type:"User"}},
    {...report(10,17,"DPNIHH",accepted),body:"Someone wrote Code: DPNIHH\nResult: "+accepted},
    {...report(11,17,"DPNIHH",accepted),body:"Code: DPNIHH\nResult: unknown"},
    {...report(12,18,"DPNIHH",accepted),issue_url:"https://evil.example/issues/14"},
    {...report(13,19,"DPNIHH",accepted),created_at:"invalid"},
    {...report(14,20,"DPNIHH",accepted),id:0},
    {...report(15,21,"DPNIHH",accepted),user:{login:"anonymous",type:"User"}}
  ];
  const result=summarizeFeedback(entries,map,replies,createdAt);
  assert.equal(result.source,"github-issue-comments");
  assert.equal(result.generatedAt,createdAt);
  assert.deepEqual(result.codes,{
    DPNIHH:{worked:1,failed:1},
    ALFA12:{worked:1,failed:0},
    BRAVO2:{worked:0,failed:1},
    EMPTY1:{worked:0,failed:0}
  });
  assert.deepEqual(summarizeFeedback(entries,map,replies.reverse(),createdAt),result,
    "GitHub pagination order must not change the tally");
});

test("same timestamp uses latest comment ID, does not double count",()=>{
  const results=summarizeFeedback(entries,map,[
    report(1,11,"DPNIHH",accepted),
    report(2,11,"DPNIHH",rejected)
  ],createdAt);
  assert.deepEqual(results.codes.DPNIHH,{worked:0,failed:1});
});

test("missing issue mappings do not invent reports or match unrelated GitHub Issues",()=>{
  const result=summarizeFeedback(entries,{},[report(1,11,"DPNIHH",accepted)],createdAt);
  assert.deepEqual(result.codes.DPNIHH,{worked:0,failed:0});
  for(const input of [null,[],{},[{code:"AB1234"}]]) {
    assert.throws(()=>summarizeFeedback(input,{},[],createdAt));
  }
  assert.throws(()=>summarizeFeedback(entries,map,[],"not-a-date"));
});

test("repository-wide paginated fetch must not silently publish incomplete counts",async()=>{
  let requests=0;
  const replies=await fetchAllFeedbackComments(async page=>{
    requests+=1;
    return page===1?Array.from({length:100},(_,i)=>({id:i+1})):[{id:101}];
  });
  assert.equal(requests,2);
  assert.equal(replies.length,101);
  await assert.rejects(()=>fetchAllFeedbackComments(async()=>Array(100).fill({}),{maxPages:2}),
    /incomplete/);
  await assert.rejects(()=>fetchAllFeedbackComments(async()=>({error:"Forbidden"})),/Invalid GitHub/);
});
