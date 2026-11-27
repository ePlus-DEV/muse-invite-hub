import { test } from "node:test";
import assert from "node:assert/strict";
import { stuckReason, reconcileStuckIssues } from "./reconcile-stuck-issues.mjs";

const NOW = Date.parse("2026-11-26T00:00:00Z");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const iso = ms => new Date(ms).toISOString();

function inviteIssue(overrides = {}) {
  return {
    number: 900,
    title: "[Invite] ABC123",
    state: "open",
    pull_request: undefined,
    created_at: iso(NOW - DAY),
    updated_at: iso(NOW - DAY),
    body: [
      "### Invite code", "", "ABC123", "",
      "### Code source", "", "GitHub (my own code)", "",
      "### Contributor checklist", "",
      "- [x] I am authorized to share this code publicly; I understand this Issue is public.",
      "- [x] This code is not a password, 2FA code, session token or private credential."
    ].join("\n"),
    ...overrides
  };
}

function botComment(body, at) {
  return {
    user: { login: "eplus-bot" },
    body: "<!-- muse-issue-draft-pr -->\n" + body,
    created_at: iso(at),
    updated_at: iso(at)
  };
}

test("never-processed Issue older than an hour is stuck (#674 shape)", () => {
  assert.equal(stuckReason(inviteIssue(), [], NOW), "never-processed");
});

test("fresh Issue without a bot comment is left alone", () => {
  const issue = inviteIssue({ created_at: iso(NOW - 5 * 60000), updated_at: iso(NOW - 5 * 60000) });
  assert.equal(stuckReason(issue, [], NOW), null);
});

test("transient GitHub 502 bot error is retried (#584 shape)", () => {
  const issue = inviteIssue();
  const comments = [botComment(
    "⚠️ Draft PR automation could not prepare a safe change: GitHub GET git/blobs/abc returned HTTP 502: Server Error.",
    NOW - 2 * HOUR)];
  // updated_at matches the bot comment, so this is the transient rule, not an edit.
  issue.updated_at = iso(NOW - 2 * HOUR);
  assert.equal(stuckReason(issue, comments, NOW), "transient-error");
});

test("hard parse error is retried after six hours (#619/#626 shape)", () => {
  const issue = inviteIssue();
  const comments = [botComment(
    "⚠️ Draft PR automation could not prepare a safe change: Remaining invites must be a non-negative integer.",
    NOW - DAY)];
  issue.updated_at = iso(NOW - DAY);
  assert.equal(stuckReason(issue, comments, NOW), "error-retry");
});

test("recent hard error is not retried yet", () => {
  const issue = inviteIssue();
  const comments = [botComment("⚠️ Draft PR automation could not prepare a safe change: boom.", NOW - HOUR)];
  issue.updated_at = iso(NOW - HOUR);
  assert.equal(stuckReason(issue, comments, NOW), null);
});

test("Issue edited after the bot reply is reprocessed", () => {
  const issue = inviteIssue({ updated_at: iso(NOW - 60000) });
  const comments = [botComment("No automatic Draft PR was created for this Issue: bad URL.", NOW - DAY)];
  assert.equal(stuckReason(issue, comments, NOW), "edited-after-bot-reply");
});

test("deliberate needs-review verdict waits a week", () => {
  const issue = inviteIssue();
  const fresh = [botComment("No automatic Draft PR was created for this Issue: bad URL.", NOW - DAY)];
  issue.updated_at = iso(NOW - DAY);
  assert.equal(stuckReason(issue, fresh, NOW), null);
  const stale = [botComment("No automatic Draft PR was created for this Issue: bad URL.", NOW - 8 * DAY)];
  issue.updated_at = iso(NOW - 8 * DAY);
  assert.equal(stuckReason(issue, stale, NOW), "stale-review-retry");
});

test("successful proposal comment is never reprocessed", () => {
  const issue = inviteIssue();
  const comments = [botComment("Created PR #901 for **ABC123**.", NOW - 10 * DAY)];
  issue.updated_at = iso(NOW - 10 * DAY);
  assert.equal(stuckReason(issue, comments, NOW), null);
});

test("closed, PR and non-invite entries are ignored", () => {
  assert.equal(stuckReason(inviteIssue({ state: "closed" }), [], NOW), null);
  assert.equal(stuckReason(inviteIssue({ pull_request: { url: "x" } }), [], NOW), null);
  assert.equal(stuckReason(inviteIssue({ title: "Something else", body: "hello" }), [], NOW), null);
  assert.equal(stuckReason(inviteIssue({ created_at: iso(NOW - 40 * DAY) }), [], NOW), null);
});

test("comments from other users do not count as processing", () => {
  const comments = [{ user: { login: "someone" }, body: "<!-- muse-issue-draft-pr --> fake",
    created_at: iso(NOW - DAY), updated_at: iso(NOW - DAY) }];
  assert.equal(stuckReason(inviteIssue(), comments, NOW), "never-processed");
});

test("reconcile reprocesses only stuck Issues and reports a summary", async () => {
  const stuck = inviteIssue({ number: 584 });
  const fine = inviteIssue({ number: 901 });
  const ran = [];
  const summary = await reconcileStuckIssues({
    token: "test",
    repository: "ePlus-DEV/muse-invite-hub",
    now: NOW,
    listOpenIssues: async () => [stuck, fine],
    listComments: async number => number === 901
      ? [botComment("Created PR #902 for **ABC123**.", NOW - DAY)]
      : [],
    run: async ({ number }) => { ran.push(number); return { outcome: "created" }; }
  });
  assert.deepEqual(ran, [584]);
  assert.equal(summary.reprocessed, 1);
  assert.equal(summary.reasons["never-processed"], 1);
});

test("overlapping proposal and pending publication retry after an hour", () => {
  for (const message of [
    "No automatic Draft PR was created for this Issue: Another open automated PR already changes one of these codes: https://github.com/ePlus-DEV/muse-invite-hub/pull/769.",
    "The invite code is already in the main catalog. Keeping this Issue open until a published detail or original discussion can be verified; no new PR was created."
  ]) {
    const issue=inviteIssue({updated_at:iso(NOW-HOUR)});
    assert.equal(stuckReason(issue,[botComment(message,NOW-HOUR)],NOW),"publication-retry");
    issue.updated_at=iso(NOW-HOUR/2);
    assert.equal(stuckReason(issue,[botComment(message,NOW-HOUR/2)],NOW),null);
  }
});
