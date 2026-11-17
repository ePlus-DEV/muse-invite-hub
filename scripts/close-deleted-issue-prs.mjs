// Keep the canonical source Issue attached to every automatically generated data PR.
// These helpers are deliberately narrow: never close arbitrary human PRs on a mention.
export const SOURCE_REPOSITORY = "ePlus-DEV/muse-invite-hub";
const BOT_AUTHORS = new Set(["eplus-bot", "github-actions[bot]"]);

export function automatedSourceIssueNumber(pr, repository = SOURCE_REPOSITORY) {
  if (pr?.state !== "open" || pr.merged_at ||
      pr.base?.ref !== "main" ||
      pr.head?.repo?.full_name !== repository ||
      !BOT_AUTHORS.has(pr.user?.login)) return null;

  const found = /^auto\/issue-([1-9][0-9]*)-(invite|count|feedback)$/.exec(
    String(pr.head?.ref || ""));
  if (!found) return null;
  const number = Number(found[1]);
  if (!Number.isSafeInteger(number) ||
      !new RegExp("\\(issue #" + number + "\\)$").test(String(pr.title || "")) ||
      !String(pr.body || "").includes("Tracks Issue #" + number + ".")) return null;
  return number;
}

// 410 is GitHub's explicit "This issue was deleted" response.
// 404 in a scheduled scan is ambiguous (auth/routing), so never close on 404
// unless the GitHub-signed issues.deleted event identifies this exact Issue.
export function deletedSourceConfirmed(status, issueNumber, deletedEventIssueNumber = null) {
  return Number.isSafeInteger(issueNumber) && issueNumber > 0 &&
    (status === 410 ||
     (status === 404 && deletedEventIssueNumber === issueNumber));
}

export function deletionNotice(number) {
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw Error("Source Issue number must be a positive integer.");
  }
  return "Automatically closing this generated data PR because its canonical "+
    "source Issue #" + number + " was deleted. Without that Issue the original "+
    "submission, contributor consent and feedback reference cannot be verified. "+
    "No code from this PR is published. If the contribution is legitimate, "+
    "submit a new Issue and let automation prepare a separate PR.";
}
