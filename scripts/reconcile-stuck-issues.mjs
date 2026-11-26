/* Reconcile stuck Share Code Issues on a schedule.
 *
 * The Issue-to-PR workflow only fires when an Issue is opened, edited or
 * reopened (or dispatched manually). A single transient failure — a GitHub
 * API 502 (Issue #584), a parser bug that a later deploy fixed (#619,
 * #626), or a run that died before commenting at all (#674) — therefore
 * left the Issue open forever with no retry. This reconciler runs from the
 * same trusted workflow on a 30-minute schedule, finds open invite Issues
 * whose bot processing is provably stale, and re-runs the exact same
 * trusted automation for them. It never publishes anything itself:
 * runIssueAutomation owns every consent, duplicate and catalog check, and
 * its bot comment is edited in place, so a re-run is idempotent.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { isShareCodeIssue } from "./code-issue-map.mjs";
import { runIssueAutomation } from "./issue-to-pr.mjs";

const REPO = "ePlus-DEV/muse-invite-hub";
const MARKER = "<!-- muse-issue-draft-pr -->";
const BOT_LOGIN = "eplus-bot";
const TRANSIENT = /returned HTTP 5\d\d|Server Error|rate limit|timed? ?out|fetch failed/i;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Pure decision: should this open Issue be reprocessed now, and why?
// `comments` is the Issue's comment list (any author); only the latest
// eplus-bot comment carrying the automation marker counts as "processed".
export function stuckReason(issue, comments, now = Date.now()) {
  if (!issue || issue.pull_request || issue.state !== "open") return null;
  if (!Number.isSafeInteger(issue.number) || issue.number <= 0) return null;
  const title = String(issue.title || "");
  if (!title.startsWith("[Invite]") && !isShareCodeIssue(issue)) return null;
  const created = Date.parse(issue.created_at || "");
  if (!Number.isFinite(created) || now - created > 30 * DAY) return null;

  const botComments = (comments || []).filter(entry =>
    entry?.user?.login === BOT_LOGIN &&
    String(entry?.body || "").includes(MARKER));
  const bot = botComments[botComments.length - 1];
  if (!bot) {
    // The opening run should comment within seconds. An hour of silence
    // means the run never started or died before it could report (#674).
    return now - created >= HOUR ? "never-processed" : null;
  }
  const botAt = Date.parse(bot.updated_at || bot.created_at || "");
  if (!Number.isFinite(botAt)) return null;
  const body = String(bot.body || "");
  // Any later Issue activity (an edit fixing the form, a maintainer touch)
  // makes the bot's last verdict stale; re-checking is idempotent.
  const issueUpdated = Date.parse(issue.updated_at || "");
  if (Number.isFinite(issueUpdated) && issueUpdated > botAt + 2 * MINUTE) {
    return "edited-after-bot-reply";
  }
  if (TRANSIENT.test(body)) {
    return now - botAt >= HOUR ? "transient-error" : null;
  }
  if (body.includes("⚠️")) {
    // A hard automation error may have been fixed by a later deploy of
    // the parser/planner; retry on a slow cadence instead of never.
    return now - botAt >= 6 * HOUR ? "error-retry" : null;
  }
  if (body.includes("No automatic Draft PR was created")) {
    // Deliberate planner verdicts (needs-review) are retried only on a
    // weekly cadence, in case planner rules changed since (for example
    // duplicate resolution ahead of source validation). Each re-run
    // refreshes the bot comment, which restarts this clock.
    return now - botAt >= 7 * DAY ? "stale-review-retry" : null;
  }
  return null;
}

const apiRoot = "https://api.github.com/repos/" + REPO + "/";
async function api(method, path, token) {
  const response = await fetch(apiRoot + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "muse-invite-hub-reconcile"
    },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) {
    throw Error("GitHub " + method + " " + path + " returned HTTP " + response.status);
  }
  return response.status === 204 ? null : response.json();
}

export async function reconcileStuckIssues({
  token = process.env.GH_TOKEN, repository = process.env.GITHUB_REPOSITORY,
  now = Date.now(), maxPerRun = 10, run = runIssueAutomation,
  listOpenIssues, listComments
} = {}) {
  if (repository !== REPO) throw Error("Unexpected repository; refusing write actions.");
  if (!token) throw Error("Missing GitHub Actions token.");
  const fetchIssues = listOpenIssues || (async () => {
    const all = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await api("GET",
        "issues?state=open&sort=created&direction=asc&per_page=100&page=" + page, token);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  });
  const fetchComments = listComments || (async number =>
    api("GET", "issues/" + number + "/comments?per_page=100", token));

  const summary = { scanned: 0, reprocessed: 0, failed: 0, reasons: {} };
  const candidates = [];
  for (const issue of await fetchIssues()) {
    if (!issue || issue.pull_request) continue;
    summary.scanned++;
    let comments;
    try {
      comments = await fetchComments(issue.number);
    } catch {
      continue; // A single unreadable Issue must not block the whole sweep.
    }
    const reason = stuckReason(issue, comments, now);
    if (reason) candidates.push({ number: issue.number, reason });
  }
  for (const candidate of candidates.slice(0, maxPerRun)) {
    summary.reasons[candidate.reason] = (summary.reasons[candidate.reason] || 0) + 1;
    console.log("Reprocessing stuck Issue #" + candidate.number +
      " (" + candidate.reason + ")");
    try {
      await run({ number: candidate.number, token, repository });
      summary.reprocessed++;
    } catch (error) {
      summary.failed++;
      console.error("Issue #" + candidate.number + " reprocess failed: " + error.message);
    }
  }
  console.log("Stuck Issue reconciliation: " + JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await reconcileStuckIssues({});
  } catch (error) {
    console.error("::error::Could not reconcile stuck Issues: " + error.message);
    process.exitCode = 1;
  }
}
