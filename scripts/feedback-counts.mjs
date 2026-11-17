/* Public, non-live feedback tally from canonical GitHub Issue comments only.
 * These are self-reported experiences, not Muse votes or verified redemptions.
 */
const ISSUE_URL = /^https:\/\/api\.github\.com\/repos\/ePlus-DEV\/muse-invite-hub\/issues\/([1-9][0-9]*)$/;
const REPORT = /^Code: ([A-Z0-9]{6})\r?\nResult: (Muse accepted my code|Muse rejected or could not redeem my code)(?:\r?\n|$)/;

export function summarizeFeedback(catalog, issueMap, comments, generatedAt) {
  if (!Array.isArray(catalog) || !issueMap || typeof issueMap !== "object" ||
      Array.isArray(issueMap) || !Array.isArray(comments) ||
      !Number.isFinite(Date.parse(generatedAt || ""))) throw Error("Invalid feedback snapshot inputs");
  const allowed = new Map();
  const results = {};
  for (const item of catalog) {
    if (!/^[A-Z0-9]{6}$/.test(item?.code || "")) continue;
    results[item.code] = {worked:0,failed:0};
    const issue = issueMap[item.code] ?? item.feedbackIssueNumber;
    if (!Number.isSafeInteger(issue) || issue <= 0) continue;
    if (!allowed.has(issue)) allowed.set(issue, new Set());
    allowed.get(issue).add(item.code);
  }
  const recent = new Map();
  for (const comment of comments) {
    const match = ISSUE_URL.exec(String(comment?.issue_url || ""));
    if (!match) continue;
    const issueCodes = allowed.get(Number(match[1]));
    if (!issueCodes || comment.user?.type !== "User" ||
        !Number.isSafeInteger(comment.user.id) || comment.user.id <= 0 ||
        /\[bot\]$/i.test(comment.user.login || "") ||
        comment.user.login === "eplus-bot") continue;
    const report = REPORT.exec(String(comment.body || ""));
    if (!report || !issueCodes.has(report[1]) ||
        !Number.isSafeInteger(comment.id) || comment.id <= 0 ||
        !Number.isFinite(Date.parse(comment.created_at || ""))) continue;
    const key = report[1] + ":" + comment.user.id;
    const stamp = Date.parse(comment.created_at);
    const previous = recent.get(key);
    if (!previous || stamp > previous.stamp ||
        (stamp === previous.stamp && comment.id > previous.id)) {
      recent.set(key,{stamp,id:comment.id,code:report[1],
        kind:report[2] === "Muse accepted my code" ? "worked" : "failed"});
    }
  }
  for (const vote of recent.values()) results[vote.code][vote.kind] += 1;
  return {source:"github-issue-comments",generatedAt,codes:results};
}

export async function fetchAllFeedbackComments(fetchPage,{maxPages=30}={}) {
  if (typeof fetchPage !== "function" || !Number.isInteger(maxPages) || maxPages < 1) {
    throw Error("Invalid GitHub feedback fetch settings");
  }
  const comments = [];
  for (let page=1;page<=maxPages;page++) {
    const batch = await fetchPage(page);
    if (!Array.isArray(batch) || batch.length > 100) throw Error("Invalid GitHub feedback response");
    comments.push(...batch);
    if (batch.length < 100) return comments;
  }
  throw Error("GitHub feedback pagination incomplete; refuse partial counts");
}
