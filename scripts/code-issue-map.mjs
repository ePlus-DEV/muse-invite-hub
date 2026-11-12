/* Canonical issue thread per published invite code; trusted main only. */
export const REPO = "ePlus-DEV/muse-invite-hub";
export const MARKER = "muse-code-feedback-thread";
const CODE = /^[A-Z0-9-]{4,32}$/;

export function issueMarker(code) {
  if (!CODE.test(code)) throw Error("Invalid invite code");
  return "<!-- " + MARKER + ": " + code + " -->";
}

export function originalIssueNumber(item) {
  const linked = item?.feedbackIssueNumber;
  if (Number.isSafeInteger(linked) && linked > 0) return linked;
  const match = /^community-issue-([1-9][0-9]*)$/.exec(item?.id || "");
  return match ? Number(match[1]) : null;
}

export function issueCode(issue) {
  if (issue?.pull_request) return null;
  const body = String(issue?.body || "");
  const match = new RegExp("<!-- " + MARKER + ": ([A-Z0-9-]{4,32}) -->").exec(body) ||
    /<!-- muse-code-feedback-root:([A-Z0-9-]{4,32}) -->/.exec(body);
  if (match) return match[1];
  // Historical contributor submission and count-update Issues remain the original
  // conversation, even when the entry id came from a different repository.
  if (!/^\[(?:Invite|Count update|Code feedback)\]/.test(String(issue?.title || ""))) return null;
  return /^### Invite code\s*\n\s*([A-Z0-9-]{4,32})\s*(?:\n|$)/m.exec(body)?.[1] || null;
}

export function canonicalThreadBody(item) {
  if (!CODE.test(item?.code || "")) throw Error("Invalid invite code");
  return [
    issueMarker(item.code),
    "## Muse invite code " + item.code,
    "",
    "This is the canonical community feedback thread for [**" + item.code +
      "**](https://muse.eplus.dev/codes/" + item.code + "/).",
    "",
    "Share your experience as a comment here. The existing issue is reused for future feedback, even after it has been closed.",
    "For a clear report, tell us whether Muse accepted, rejected or exhausted the code, and when you tried it.",
    "Do not post passwords, account data, login tokens or private screenshots.",
    "",
    "A visitor report is not proof of Muse acceptance or live availability. Maintainers review status changes before publication."
  ].join("\n");
}

export function resolveExistingIssue(item, issues) {
  const code = item.code;
  const issueNo = originalIssueNumber(item);
  const candidates = issues.filter(issue => !issue.pull_request &&
    Number.isSafeInteger(issue.number) && issue.number > 0 &&
    issueCode(issue) === code &&
    (issue.number === issueNo ||
      /^\[(?:Invite|Count update|Code feedback)\]/.test(String(issue.title || "")) ||
      String(issue.body || "").includes(issueMarker(code)) ||
      /<!-- muse-code-feedback-root:[A-Z0-9-]{4,32} -->/.test(String(issue.body || ""))));
  const source = candidates.find(x => x.number === issueNo);
  if (item.feedbackIssueNumber && !source) {
    throw Error("Explicit code Issue mapping not found or code mismatch for " + code);
  }
  if (candidates.length > 1) throw Error("Duplicate canonical feedback issues for " + code);
  if (source) return source;
  return candidates[0] || null;
}

export async function syncCodeIssueMap(items, listIssues, createIssue, {allowMissing = false} = {}) {
  if (!Array.isArray(items) || typeof listIssues !== "function" || typeof createIssue !== "function") {
    throw Error("Expected catalog and GitHub API callbacks");
  }
  const issues = await listIssues();
  if (!Array.isArray(issues)) throw Error("Expected GitHub Issues array");
  const map = {};
  for (const item of items) {
    if (!CODE.test(item?.code || "") || Object.hasOwn(map, item.code)) {
      throw Error("Invalid or duplicate published invite code");
    }
    let existing;
    try {
      existing = resolveExistingIssue(item, issues);
    } catch (error) {
      // PR validation uses a read-only partial GitHub Issue view. It must never
      // create Issues or require the production map before the trusted deploy.
      if (allowMissing && error.message.startsWith("Explicit code Issue mapping not found")) continue;
      throw error;
    }
    if (!existing && allowMissing) continue;
    if (!existing) {
      const created = await createIssue({
        title: "[Code] " + item.code + " — community feedback",
        body: canonicalThreadBody(item)
      });
      if (!Number.isSafeInteger(created?.number) || created.number <= 0 ||
          issueCode(created) !== item.code) {
        throw Error("Could not verify GitHub issue created for " + item.code);
      }
      issues.push(created);
      existing = created;
    }
    map[item.code] = existing.number;
  }
  return map;
}

export function validIssueMap(map, entries) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return false;
  return Object.keys(map).length === entries.length &&
    entries.every(entry => Number.isSafeInteger(map[entry.code]) && map[entry.code] > 0);
}
