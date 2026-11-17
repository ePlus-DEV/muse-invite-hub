/* Persist reviews in per-code JSON files, committed ONLY via reviewed/merged
 * GitHub PRs. No Pages build should rescan comments or fabricate counts.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { feedbackCodeForIssue } from "./reopen-code-feedback.mjs";

export const LEDGER_DIR = "feedback-stats";
const CODE = /^[A-Z0-9]{6}$/;
const REPORT = /^Code: ([A-Z0-9]{6})\r?\nResult: (Muse accepted my code|Muse rejected or could not redeem my code)(?:\r?\n|$)/;
const outcomes = {
  "Muse accepted my code": "worked",
  "Muse rejected or could not redeem my code": "failed"
};

export function ledgerPath(code) {
  if (!CODE.test(code || "")) throw Error("Invalid feedback code");
  return LEDGER_DIR + "/" + code + ".json";
}

// A report is eligible for a Draft PR only when it is posted by a real user
// on the canonical Issue for that code; eligibility is NOT approval.
export function parseReviewableFeedback(issue, comment, catalog) {
  if (!Array.isArray(catalog) || typeof comment?.body !== "string" ||
      comment.body.length > 3500 || issue?.pull_request ||
      !Number.isSafeInteger(issue?.number) || issue.number <= 0 ||
      !Number.isSafeInteger(comment?.id) || comment.id <= 0 ||
      !Number.isSafeInteger(comment?.user?.id) || comment.user.id <= 0 ||
      comment.user.type !== "User" || !comment.user.login ||
      /(?:\[bot\])$/i.test(comment.user.login) ||
      comment.user.login === "eplus-bot" ||
      comment.issue_url?.split("/").at(-1) !== String(issue.number) ||
      !Number.isFinite(Date.parse(comment.created_at || ""))) return null;
  const hit = REPORT.exec(comment.body);
  if (!hit) return null;
  const code = feedbackCodeForIssue(issue,catalog,comment.body);
  if (code !== hit[1]) return null;
  const item = catalog.find(row=>row.code===code);
  if (!item || item.feedbackIssueNumber !== issue.number) return null;
  return {
    code,issueNumber:issue.number,commentId:comment.id,
    userId:comment.user.id,recordedAt:new Date(comment.created_at).toISOString(),
    outcome:outcomes[hit[2]]
  };
}

export function validateFeedbackLedger(ledger,expectedCode) {
  if (!CODE.test(expectedCode || "") || !ledger || Array.isArray(ledger) ||
      typeof ledger !== "object" ||
      ledger.code !== expectedCode || !ledger.users ||
      Array.isArray(ledger.users) || typeof ledger.users !== "object") {
    throw Error("Invalid reviewed feedback ledger: "+expectedCode);
  }
  const keys = Object.keys(ledger);
  if (keys.some(k=>!["code","users"].includes(k))) throw Error("Unexpected ledger field");
  for (const [id,entry] of Object.entries(ledger.users)) {
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id)) ||
        !entry || Array.isArray(entry) || typeof entry!=="object" ||
        Object.keys(entry).some(k=>!["issueNumber","commentId","recordedAt","outcome"].includes(k)) ||
        !Number.isSafeInteger(entry.issueNumber) || entry.issueNumber<=0 ||
        !Number.isSafeInteger(entry.commentId) || entry.commentId<=0 ||
        !Number.isFinite(Date.parse(entry.recordedAt||"")) ||
        !["worked","failed"].includes(entry.outcome)) throw Error("Invalid reviewed feedback entry");
  }
  return ledger;
}

export function addReviewedFeedback(previous,report) {
  const code = report?.code;
  const base=validateFeedbackLedger(previous ?? {code,users:{}},code);
  if (!Number.isSafeInteger(report?.userId) || report.userId<=0 ||
      !Number.isSafeInteger(report.issueNumber) || report.issueNumber<=0 ||
      !Number.isSafeInteger(report.commentId) || report.commentId<=0 ||
      !Number.isFinite(Date.parse(report.recordedAt || "")) ||
      !["worked","failed"].includes(report.outcome)) throw Error("Invalid feedback report");
  const id=String(report.userId);
  const old=base.users[id];
  const next={issueNumber:report.issueNumber,commentId:report.commentId,
    recordedAt:report.recordedAt,outcome:report.outcome};
  if (old) {
    const older = Date.parse(next.recordedAt) < Date.parse(old.recordedAt) ||
      (Date.parse(next.recordedAt) === Date.parse(old.recordedAt) &&
       next.commentId < old.commentId);
    if (older) return {changed:false,reason:"older-report",ledger:base};
    if (old.commentId===next.commentId && old.outcome===next.outcome &&
        old.recordedAt===next.recordedAt) {
      return {changed:false,reason:"already-reviewed",ledger:base};
    }
  }
  const users={...base.users,[id]:next};
  return {changed:true,ledger:validateFeedbackLedger({code,users},code)};
}

export function summarizeApprovedFeedback(catalog,loadLedger,generatedAt) {
  if (!Array.isArray(catalog) || typeof loadLedger!=="function" ||
      !Number.isFinite(Date.parse(generatedAt||""))) throw Error("Invalid feedback aggregation inputs");
  const codes={};
  for(const item of catalog) {
    if (!CODE.test(item?.code||"") || Object.hasOwn(codes,item.code)) throw Error("Invalid invite code in feedback catalog");
    const ledger=loadLedger(item.code);
    const summary={worked:0,failed:0};
    if (ledger) {
      validateFeedbackLedger(ledger,item.code);
      for (const user of Object.values(ledger.users)) {
        // A code must not count reports attributed to a different Issue.
        if (user.issueNumber !== item.feedbackIssueNumber) {
          throw Error("Feedback ledger does not match canonical issue for "+item.code);
        }
        summary[user.outcome]++;
      }
    }
    codes[item.code]=summary;
  }
  return {source:"reviewed-github-feedback",generatedAt,codes};
}

export function readReviewedFeedback(code,root=process.cwd()) {
  const file=join(root,ledgerPath(code));
  if (!existsSync(file)) return null;
  return validateFeedbackLedger(JSON.parse(readFileSync(file,"utf8")),code);
}

export function validateFeedbackDirectory(root=process.cwd()) {
  const dir=join(root,LEDGER_DIR);
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (!/^[A-Z0-9]{6}\.json$/.test(name)) throw Error("Invalid feedback ledger filename: "+name);
    readReviewedFeedback(name.slice(0,6),root);
  }
}
