// Pure decisions for GitHub Issue metadata triage.
// Preserve existing labels/assignees; never infer invite-code validity from a label.
export const TRIAGE_ASSIGNEE = "hoangsvit";

export const TRIAGE_LABELS = Object.freeze({
  "type: invite": {
    color: "7057ff",
    description: "New community invite-code submission; publication does not verify redemption"
  },
  "type: count-update": {
    color: "1d76db",
    description: "Community or owner-reported Muse invite quota update"
  },
  "type: feedback": {
    color: "fbca04",
    description: "Feedback about an existing Muse invite code"
  },
  "type: discussion": {
    color: "0e8a16",
    description: "Canonical discussion thread for an invite code"
  },
  "type: bug": {
    color: "d73a4a",
    description: "Bug or malfunction reported by a contributor"
  },
  "type: enhancement": {
    color: "a2eeef",
    description: "Requested improvement or new feature"
  },
  "needs-triage": {
    color: "ededed",
    description: "Issue category requires maintainer triage"
  }
});

function heading(body, label) {
  return new RegExp("^### " + label + "\\s*$", "im").test(body);
}

export function classifyIssue(issue) {
  const title = String(issue?.title || "").trim();
  const body = String(issue?.body || "");
  // Check specific forms before the generic Invite form. Never classify
  // a discussion or a count report as a fresh invite submission.
  if (/^\[Code discussion\]/i.test(title) ||
      /^\[Code\]\s+[A-Z0-9-]{4,32}\b/i.test(title) ||
      body.includes("<!-- muse-code-feedback-root:") ||
      body.includes("<!-- muse-code-feedback-thread:")) {
    return "type: discussion";
  }
  if (/^\[Count update\]/i.test(title) ||
      (heading(body, "Invite code") && heading(body, "Remaining invites shown by Muse"))) {
    return "type: count-update";
  }
  if (/^\[Code feedback\]/i.test(title) ||
      (heading(body, "Invite code") && heading(body, "What happened\\?"))) {
    return "type: feedback";
  }
  if (/^\[Invite\]/i.test(title) || /^\[Telegram submission\]/i.test(title) ||
      (heading(body, "Invite code") && heading(body, "Code source"))) {
    return "type: invite";
  }
  if (/^(?:\[Bug\]|bug:|fix:)/i.test(title)) return "type: bug";
  if (/^(?:\[Feature\]|\[Enhancement\]|feat:|feature:)/i.test(title)) return "type: enhancement";
  return "needs-triage";
}

export function triageDecision(issue) {
  if (!issue || issue.pull_request || !Number.isSafeInteger(issue.number) || issue.number < 1) {
    return null;
  }
  const label = classifyIssue(issue);
  const labels = (issue.labels || []).map(item => typeof item === "string" ? item : item?.name);
  const assignees = (issue.assignees || []).map(item =>
    typeof item === "string" ? item : item?.login
  );
  return {
    number: issue.number,
    label,
    addLabel: !labels.some(name => String(name || "").toLowerCase() === label.toLowerCase()),
    assignee: TRIAGE_ASSIGNEE,
    addAssignee: !assignees.some(name =>
      String(name || "").toLowerCase() === TRIAGE_ASSIGNEE.toLowerCase()
    )
  };
}
