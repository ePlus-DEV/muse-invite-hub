import test from "node:test";
import assert from "node:assert/strict";
import { classifyIssue, triageDecision, TRIAGE_ASSIGNEE, TRIAGE_LABELS } from "./issue-triage.mjs";

const issue=(number,title,body="",more={})=>({number,title,body,labels:[],assignees:[],...more});

test("classify real GitHub Issue form types and bot-created discussion threads",()=>{
  const cases=[
    ["[Invite] 0W9L6E","### Invite code\n\n0W9L6E\n\n### Code source\n\nGitHub (my own code)","type: invite"],
    ["X8QA4Q","### Invite code\n\nX8QA4Q\n\n### Code source\n\nGitHub (my own code)","type: invite"],
    ["[Telegram submission] test","An unverified public code","type: invite"],
    ["[Count update] DPNIHH","### Invite code\n\nDPNIHH","type: count-update"],
    ["Another title","### Invite code\n\nDPNIHH\n\n### Remaining invites shown by Muse\n\n25","type: count-update"],
    ["[Code feedback] XUPYT1","### Invite code\n\nXUPYT1","type: feedback"],
    ["Another title","### Invite code\n\nXUPYT1\n\n### What happened?\n\nNot working","type: feedback"],
    ["[Code discussion] AAFWLA","Canonical listing","type: discussion"],
    ["Other name","<!-- muse-code-feedback-root:AAFWLA -->","type: discussion"],
    ["[Code] DPNIHH — community feedback","<!-- muse-code-feedback-thread: DPNIHH -->","type: discussion"],
    ["User-edited title","<!-- muse-code-feedback-thread: ABC123 -->","type: discussion"],
    ["[Code] 123ABC — community feedback","Canonical thread","type: discussion"],
    ["[Bug] bad preview","","type: bug"],
    ["feat: improve filter","","type: enhancement"],
    ["Regular question","","needs-triage"]
  ];
  for(const [title,body,expected] of cases){
    assert.equal(classifyIssue({title,body}),expected,title);
    assert.ok(TRIAGE_LABELS[expected],"Label metadata missing: "+expected);
  }
});

test("a new Issue gets one type label and @hoangsvit without replacing other metadata",()=>{
  assert.equal(TRIAGE_ASSIGNEE,"hoangsvit");
  const input=issue(113,"[Invite] sample","",{
    labels:[{name:"priority: high"},{name:"needs-review"}],
    assignees:[{login:"other-maintainer"}]
  });
  assert.deepEqual(triageDecision(input),{
    number:113,label:"type: invite",addLabel:true,assignee:"hoangsvit",addAssignee:true
  });
  assert.deepEqual(input.labels.map(x=>x.name),["priority: high","needs-review"]);
  assert.deepEqual(input.assignees.map(x=>x.login),["other-maintainer"]);
});

test("reprocessing never adds duplicate labels or assignees",()=>{
  const input=issue(117,"[Invite] repeated","",{
    labels:[{name:"Type: Invite"}],
    assignees:[{login:"HoangSvit"}]
  });
  assert.deepEqual(triageDecision(input),{
    number:117,label:"type: invite",addLabel:false,assignee:"hoangsvit",addAssignee:false
  });
  assert.deepEqual(triageDecision(issue(118,"Something","",{labels:["needs-triage"],assignees:["hoangsvit"]})),{
    number:118,label:"needs-triage",addLabel:false,assignee:"hoangsvit",addAssignee:false
  });
});

test("ignore pull requests and invalid issue objects; never assume code was verified",()=>{
  assert.equal(triageDecision(issue(13,"[Invite] xyz","",{pull_request:{url:"PR"}})),null);
  assert.equal(triageDecision(null),null);
  assert.equal(triageDecision(issue(0,"[Invite] xyz")),null);
  assert.equal(Object.keys(triageDecision(issue(13,"[Invite] xyz"))).includes("verified"),false);
});
