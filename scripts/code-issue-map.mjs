/* Canonical issue thread per published invite code; trusted main only. */
export const REPO = "ePlus-DEV/muse-invite-hub";
export const MARKER = "muse-code-feedback-thread";
const CODE = /^[A-Z0-9]{6}$/;

// Issue Forms accept one or more public invite codes. Never silently drop
// malformed or duplicate tokens: each code must be reviewed individually.
export function parseInviteCodes(value) {
  const input=String(value ?? "").trim();
  const tokens=input.toUpperCase().split(/[\s,;，；]+/).filter(Boolean);
  const valid=tokens.length >= 1 && tokens.length <= 10 &&
    tokens.every(code => CODE.test(code)) &&
    new Set(tokens).size === tokens.length;
  if (valid) return tokens;

  // Full Muse referral messages may include a standalone Spanish "Código:"
  // line. Accept exactly one explicit label, not arbitrary 6-character tokens
  // from promotional text or links. Preserve consent/source validation.
  const labelled=input.split(/\r?\n/).filter(line =>
    /^\s*(?:Invite\s+code|Code|C[oó]digo)\s*:/iu.test(line));
  if (labelled.length === 1) {
    const exact=/^\s*(?:Invite\s+code|Code|C[oó]digo)\s*:\s*([A-Z0-9]{6})\s*$/iu.exec(labelled[0]);
    if (exact) return [exact[1].toUpperCase()];
  }
  throw Error("Invite code must contain 1–10 distinct 6-character codes (letters A–Z or digits 0–9; no hyphens), separated by whitespace, commas or semicolons; or a single standalone 'Code: ABC123' / 'Código: ABC123' line in a pasted referral message.");
}


// GitHub Issue Form titles are editable. Identify structured Share Code forms
// by the submitted fields, not by an optional [Invite] prefix.
export function isShareCodeIssue(issue) {
  if (!issue || issue.pull_request) return false;
  const body = String(issue.body || "");
  return /^### Invite code\s*$/m.test(body) &&
    /^### Code source\s*$/m.test(body) &&
    /^### Contributor checklist\s*$/m.test(body);
}

export function issueMarker(code) {
  if (!CODE.test(code)) throw Error("Invalid invite code");
  return "<!-- " + MARKER + ": " + code + " -->";
}

// Resolve the same trusted canonical map in the Issue reopener and PR proposer.
export function withCanonicalIssueRefs(records, mapping) {
  if (!Array.isArray(records) || !mapping || Array.isArray(mapping) ||
      typeof mapping !== "object") throw Error("Expected catalog and canonical Issue map");
  return records.map(entry => {
    const issueNumber = mapping[entry.code];
    if (issueNumber === undefined) return entry;
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
      throw Error("Invalid canonical Issue mapping for " + entry.code);
    }
    if (Number.isSafeInteger(entry.feedbackIssueNumber) &&
        entry.feedbackIssueNumber !== issueNumber) {
      throw Error("Conflicting canonical Issue mapping for " + entry.code);
    }
    return {...entry,feedbackIssueNumber:issueNumber};
  });
}

export function originalIssueNumber(item) {
  const linked = item?.feedbackIssueNumber;
  if (Number.isSafeInteger(linked) && linked > 0) return linked;
  const match = /^community-issue-([1-9][0-9]*)$/.exec(item?.id || "");
  return match ? Number(match[1]) : null;
}

export function issueCodes(issue) {
  if (issue?.pull_request) return [];
  const body = String(issue?.body || "");
  const marker = new RegExp("<!-- " + MARKER + ": ([A-Z0-9]{6}) -->").exec(body) ||
    /<!-- muse-code-feedback-root:([A-Z0-9]{6}) -->/.exec(body);
  if (marker) return [marker[1]];
  if (!/^\[(?:Invite|Count update|Code feedback)\]/.test(String(issue?.title || "")) &&
      !isShareCodeIssue(issue)) return [];
  const heading = /^### Invite code[ \t]*\r?$/m.exec(body);
  if (!heading) return [];
  const rest = body.slice(heading.index + heading[0].length).replace(/^\r?\n/, "");
  const next = rest.search(/^### /m);
  const value = (next < 0 ? rest : rest.slice(0, next)).trim();
  try {
    return parseInviteCodes(value);
  } catch {
    return [];
  }
}

export function issueCode(issue) {
  return issueCodes(issue)[0] || null;
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
    issueCodes(issue).includes(code) &&
    (issue.number === issueNo ||
      /^\[(?:Invite|Count update|Code feedback)\]/.test(String(issue.title || "")) ||
      isShareCodeIssue(issue) ||
      String(issue.body || "").includes(issueMarker(code)) ||
      /<!-- muse-code-feedback-root:[A-Z0-9]{6} -->/.test(String(issue.body || ""))));
  const source = candidates.find(x => x.number === issueNo);
  if (item.feedbackIssueNumber && !source) {
    throw Error("Explicit code Issue mapping not found or code mismatch for " + code);
  }
  // A code can have many historical quota/feedback Issues. A reviewed
  // feedbackIssueNumber is the canonical conversation, not a duplicate report.
  // Still fail closed if there is a *different* explicitly marked root thread.
  if (source) {
    const competingRoot = candidates.find(issue => issue.number !== source.number &&
      (String(issue.body || "").includes(issueMarker(code)) ||
       String(issue.body || "").includes("<!-- muse-code-feedback-root:" + code + " -->")));
    if (competingRoot) throw Error("Duplicate canonical feedback issues for " + code);
    return source;
  }
  // Without a reviewed mapping, multiple plausible Issues remain ambiguous.
  if (candidates.length > 1) throw Error("Duplicate canonical feedback issues for " + code);
  return candidates[0] || null;
}

export async function syncCodeIssueMap(items, listIssues, createIssue, {allowMissing = false} = {}) {
  if (!Array.isArray(items) || typeof listIssues !== "function" || typeof createIssue !== "function") {
    throw Error("Expected catalog and GitHub API callbacks");
  }
  const issues = await listIssues();
  if (!Array.isArray(issues)) throw Error("Expected GitHub Issues array");
  // Preflight all explicit mappings before creating any feedback threads.
  // Report every broken reference in one deploy failure; never auto-rebind an
  // existing attribution to a different contributor or hide an API failure.
  if (!allowMissing) {
    const errors = [];
    for (const item of items) {
      if (!item?.feedbackIssueNumber) continue;
      try {
        resolveExistingIssue(item, issues);
      } catch (error) {
        errors.push(item.code + " (#" + item.feedbackIssueNumber + "): " + error.message);
      }
    }
    if (errors.length) throw Error("Canonical Issue mapping preflight failed: " + errors.join("; "));
  }
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
