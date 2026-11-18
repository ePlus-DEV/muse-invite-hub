import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { validateCatalog } from "./validate.mjs";
import { MAX_INVITES_PER_CODE } from "./invite-quota-policy.mjs";
import { fetchGitHubCatalog, changedRecord, changedRecords } from "./catalog.mjs";
import { parsePublicSource, listedPlatform, LISTING_PLATFORMS } from "./source-platform.mjs";
import { isShareCodeIssue, issueCodes, originalIssueNumber, parseInviteCodes, withCanonicalIssueRefs } from "./code-issue-map.mjs";

const REPO = "ePlus-DEV/muse-invite-hub";
const MARKER = "<!-- muse-issue-draft-pr -->";
const CODE_PATTERN = /^[A-Z0-9]{6}$/;
const USER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_OWN = "GitHub (my own code)";
export const AUTO_PUBLISH_NEW_INVITE_MARKER = "<!-- muse-auto-publish-new-github-v1 -->";
export const AUTO_PUBLISH_NEW_SOCIAL_INVITE_MARKER = "<!-- muse-auto-publish-new-public-post-v1 -->";
export const AUTO_PUBLISH_NEW_TELEGRAM_INVITE_MARKER = "<!-- muse-auto-publish-new-telegram-v1 -->";
const THREADS_FOUND = "Threads (public code I found)";
const X_FOUND = "X (Twitter) (public code I found)";
const FACEBOOK_FOUND = "Facebook (public code I found)";
const TELEGRAM_COMMUNITY = "Telegram (community code shared through bot)";
const THREADS_FIELD = "Threads public post or profile URL (required for Threads)";
const SOCIAL_FIELD = "Social post or profile URL (required for Threads, X or Facebook)";
const listedPlatformOf = listedPlatform;
const SUBMISSION_PLATFORMS = new Map([
  [GITHUB_OWN, "GitHub"],
  [THREADS_FOUND, "Threads"],
  [X_FOUND, "X (Twitter)"],
  [FACEBOOK_FOUND, "Facebook"],
  [TELEGRAM_COMMUNITY, "Telegram"]
]);
function threadsReference(value) {
  const social = parsePublicSource(value);
  return social?.platform === "Threads" ? social : null;
}

export function readIssueFields(body) {
  const values = {};
  const sections = String(body ?? "").split(/^### /m).slice(1);
  for (const section of sections) {
    const firstBreak = section.indexOf("\n");
    if (firstBreak < 0) continue;
    const title = section.slice(0, firstBreak).trim();
    const value = section.slice(firstBreak + 1).trim();
    if (!title || Object.hasOwn(values, title)) continue;
    values[title] = !value || value === "_No response_" ? "" : value;
  }
  return values;
}
function field(fields, name) {
  return fields[name] || "";
}
// A manually created GitHub Issue is not a Telegram bot submission. Without any
// public Telegram sender/source to attribute, credit only the GitHub reporter.
// Never trust a self-inserted Telegram marker or silently claim Telegram ownership.
function isUnattributedHumanTelegramIssue(issue, fields) {
  if (field(fields,"Code source").trim() !== TELEGRAM_COMMUNITY ||
      ["eplus-bot","github-actions[bot]"].includes(issue.user?.login)) return false;
  const provenanceFields = [
    SOCIAL_FIELD, THREADS_FIELD, "Public confirmation or context (optional)",
    "Telegram contributor"
  ];
  if (provenanceFields.some(name => field(fields,name).trim())) return false;
  const notes = field(fields,"Notes (optional)");
  // A handle/link in notes still represents a Telegram attribution claim.
  return !/(?:https?:\/\/|(?:^|[\s(])@[A-Za-z][A-Za-z0-9_]{4,31}\b|(?:^|[\s(])(?:t\.me|telegram\.me)\/)/i.test(notes);
}
// The web form requires these checkboxes, but Issues created through the API
// or other non-form entry points can omit them. Validate the actual Issue body.
export function hasRequiredInviteConfirmations(body) {
  const checklist = field(readIssueFields(body), "Contributor checklist");
  const checked = checklist.replace(/-\s*\[X\]/g, "- [x]");
  const permission = /^\s*-\s*\[x\]\s*(?:I am authorized to share this code publicly|I own this public code or am reporting a code explicitly shared publicly)/m.test(checked);
  const privacy = /^\s*-\s*\[x\]\s*This code is not a password, 2FA code, session token or private credential\./m.test(checked);
  return permission && privacy;
}

// Give contributors concrete edit-in-place instructions without treating missing
// fields as their fault or ever checking a consent box on their behalf.
export function missingInviteConfirmationGuidance() {
  return [
    "⚠️ The Contributor checklist was missing or incomplete when this Issue arrived. "+
      "This may be caused by the submission form or integration, not by the contributor.",
    "",
    "**You do not need to create another Issue. This one stays open.**",
    "",
    "To fix the existing Issue: choose **… → Edit** on the first Issue message, "+
      "find the **Contributor checklist** section (or add it at the end), "+
      "and personally confirm both statements if they are true:",
    "",
    "```markdown",
    "### Contributor checklist",
    "",
    "- [ ] I own this public code or am reporting a code explicitly shared publicly at the source URL above; this issue is public.",
    "- [ ] This code is not a password, 2FA code, session token or private credential.",
    "```",
    "",
    "Change each `[ ]` to `[x]` **only after you personally agree**. "+
      "Save the edited Issue; the automation will re-check this same Issue. "+
      "If you cannot confirm a statement, leave it unchecked and ask a maintainer for help.",
    "",
    "For future submissions, please use the "+
      "[Share Code form](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml), "+
      "which requests both confirmations before submission.",
    "",
    "No Draft PR or public catalog update was made from the incomplete submission."
  ].join("\n");
}

export function inviteNeedsConfirmationReview(issue) {
  if (issue?.state !== "open" || issue.pull_request) return false;
  if (!String(issue.title || "").startsWith("[Invite]") && !isShareCodeIssue(issue)) return false;
  if (!Object.hasOwn(readIssueFields(issue.body), "Invite code")) return false;
  return !hasRequiredInviteConfirmations(issue.body);
}
// Optional form fields are sometimes filled with explicit "unknown" prose.
// Treat only known no-data statements as absent; malformed numeric claims
// must still fail rather than silently publishing guessed quotas.
function plainOptionalText(value) {
  return String(value ?? "").trim().replace(/^_+|_+$/g, "").trim();
}
function explicitlyUnreported(value) {
  return /^(?:n\/?a|none|unknown|not (?:currently )?(?:known|available|reported|verified from the muse invite screen))\.?$/i
    .test(plainOptionalText(value));
}
function explicitlyNoSocialSource(value) {
  return /^(?:n\/?a|none|not applicable|no social (?:source|post|url)(?:[;,]\s*this is my own (?:referral )?code)?)[.!]?$/i
    .test(plainOptionalText(value));
}
function optionalInteger(value, name, max = MAX_INVITES_PER_CODE) {
  const str = String(value ?? "").trim();
  if (!str || explicitlyUnreported(str)) return null;
  if (!/^(?:0|[1-9][0-9]{0,3})$/.test(str)) throw Error(name + " must be a non-negative integer.");
  const n = Number(str);
  if (n > max) throw Error(name + " must be between 0 and " + max + ".");
  return n;
}
function reportDate(issue) {
  // Submission date is a clearly documented reporting date, not a Muse API timestamp.
  const timestamp = issue.updated_at || issue.created_at;
  const date = new Date(timestamp || "");
  if (!Number.isFinite(date.getTime())) throw Error("Missing Issue report date.");
  return date.toISOString().slice(0, 10);
}
function codesFrom(fields) {
  return parseInviteCodes(field(fields, "Invite code"));
}
function findCode(records, code) {
  return records.find(item => item.code.toUpperCase() === code) || null;
}
// A dated remaining-only owner report must not imply an unknown total.
function remainingFromLegacyNotes(fields, label) {
  const notes = field(fields,label);
  const matches = [...notes.matchAll(/\b(0|[1-9][0-9]{0,3})\s+(?:uses?|invites?)\s+(?:left|remaining)\b/gi)];
  return matches.length === 1 ? optionalInteger(matches[0][1],"Remaining invites") : null;
}
function actualQuota(fields, date, labels) {
  const total = optionalInteger(field(fields, labels.total), "Total invites");
  const used = optionalInteger(field(fields, labels.used), "Used invites");
  let remaining = labels.remaining
    ? optionalInteger(field(fields, labels.remaining), "Remaining invites") : null;
  if (remaining === null && labels.notes) remaining = remainingFromLegacyNotes(fields,labels.notes);
  if (total !== null) {
    if (total === 0) throw Error("Total invite quota must be positive.");
    const count = used !== null ? used : remaining !== null ? total - remaining : null;
    if (count === null) return null;
    if (count < 0 || count > total || (remaining !== null && total - count !== remaining)) {
      throw Error("Reported total, used and remaining figures are inconsistent.");
    }
    return { reportedCapacity: total, reportedUses: count, usageReportedAt: date };
  }
  // Simplified two-number report. When the owner supplies both remaining
  // and used, their sum is a reported total (not the project's maximum 30).
  // Never infer a 30-slot allocation from the global upper bound.
  if (remaining !== null && used !== null) {
    const derivedTotal = remaining + used;
    if (derivedTotal < 1 || derivedTotal > MAX_INVITES_PER_CODE) {
      throw Error("Remaining plus used must total between 1 and "+MAX_INVITES_PER_CODE+" invites.");
    }
    return {reportedCapacity:derivedTotal,reportedUses:used,usageReportedAt:date};
  }
  // Used-only remains ambiguous when the actual total is unknown.
  if (used !== null) throw Error("Used invites requires Remaining invites or a known Total invites.");
  if (remaining !== null) return { reportedRemaining: remaining, usageReportedAt: date };
  return null;
}
function ownerMatches(existing, issue) {
  if (Number.isSafeInteger(existing.submittedById)) return existing.submittedById === issue.user?.id;
  return String(existing.submittedBy || "").toLowerCase() === issue.user?.login?.toLowerCase();
}
function updateQuota(target, quota, date) {
  if (target.usageReportedAt && target.usageReportedAt > date) return "stale";
  const keys=["reportedCapacity","reportedUses","reportedRemaining","usageReportedAt"];
  if (keys.every(key=>target[key]===quota[key])) return "duplicate";
  // Apply the same safety rule to owner count Issues, edits of original
  // invite Issues, and canonical Issue comments. Never silently discard a
  // published complete snapshot when a new report only supplies "remaining".
  if (quota.reportedRemaining !== undefined &&
      Number.isInteger(target.reportedCapacity) &&
      Number.isInteger(target.reportedUses) &&
      typeof target.usageReportedAt === "string") return "requires-total";
  const hadSnapshot = typeof target.usageReportedAt === "string" &&
    keys.slice(0,3).some(key => target[key] !== undefined);
  for (const key of keys) delete target[key];
  Object.assign(target,quota);
  if (hadSnapshot) target.quotaUpdateCount = (target.quotaUpdateCount || 0) + 1;
  return "updated";
}
function quotaUpdateBlocked(state,kind,code) {
  return {outcome:state==="stale"||state==="requires-total"?"needs-review":"duplicate",kind,code,
    reason:state==="stale"?"Newer usage data is already published.":
      state==="requires-total"
        ? "The existing quota snapshot is incomplete or inconsistent; it cannot be replaced safely with remaining alone. Provide remaining and used from Muse, or request maintainer review."
        : "The published catalog already has this dated quota."};
}
function rememberOwnerId(target,issue) {
  if (Number.isSafeInteger(issue.user?.id) && issue.user.id > 0) target.submittedById=issue.user.id;
}
function summary(issue, code, action) {
  return "Community Issue #" + issue.number + " (" + action + "), code " + code +
    "; maintainer review required, no live redemption verification.";
}

function planMultiInvite(issue, current, codes, fields) {
  const quotas = [
    "Uses so far (optional; self-reported)",
    "Invite limit (optional; self-reported)",
    "Remaining invites (optional; self-reported)"
  ];
  if (quotas.some(name => field(fields, name).trim())) {
    return {outcome:"needs-review",kind:"invite",code:codes.join(", "),
      reason:"For multiple invite codes, leave per-code uses/limit/remaining fields blank; provide separate owner-count updates after publication."};
  }
  const existing = codes.filter(code => findCode(current,code));
  if (existing.length===codes.length){
    const canonicalIssueNumbers=[...new Set(codes.map(code=>originalIssueNumber(findCode(current,code)))
      .filter(Number.isSafeInteger))];
    // Multi-code Issues can be resolved as duplicates only when every code is
    // already listed; mixed new/existing batches still require human triage.
    return {
      outcome:canonicalIssueNumbers.length===1 && canonicalIssueNumbers[0]===issue.number
        ? "already-published":"already-listed",
      kind:"invite",code:codes[0],codes,canonicalIssueNumbers,
      reason:"All submitted invite codes are already included in the catalog."
    };
  }
  if (existing.length){
    return {outcome:"needs-review",kind:"invite",code:codes.join(", "),
      reason:"Invite code "+existing[0]+" is already in the catalog. Multi-code Issues must contain only new, distinct codes."};
  }
  const parts = String(issue.body || "").split(/^### /m);
  const index = parts.findIndex(part => /^Invite code\r?\n/.test(part));
  if (index < 0) throw Error("Invite code field is missing.");
  let data = current;
  const notices = [];
  for (const code of codes) {
    const fieldsForCode = [...parts];
    fieldsForCode[index] = "Invite code\n\n"+code+"\n\n";
    const singleIssue = {...issue,body:fieldsForCode.join("### ")};
    const plan = planIssueChange(singleIssue,data,{deferValidation:true});
    if (plan.outcome !== "proposal" || plan.action.startsWith("update")) {
      return {outcome:"needs-review",kind:"invite",code:codes.join(", "),
        reason:"Code "+code+" cannot be submitted automatically: "+
          (plan.reason || "existing or unreviewed code")};
    }
    const item = plan.data.find(entry => entry.code === code);
    if (!item || item.id !== "community-issue-"+issue.number) {
      throw Error("Multi-code record attribution could not be verified.");
    }
    item.id = "community-issue-"+issue.number+"-"+code.toLowerCase();
    item.feedbackIssueNumber = issue.number;
    data = plan.data;
    if (plan.notice) notices.push(code+": "+plan.notice);
  }
  const errors = validateCatalog(data);
  if (errors.length) throw Error("Generated multi-code catalog failed validation: "+errors.join("; "));
  return {
    outcome:"proposal",kind:"invite",code:codes[0],codes,
    action:"add "+codes.length+" codes",data,
    notice:notices.join("\n") || "All codes remain unverified and require human review.",
    branch:"auto/issue-"+issue.number+"-invite",
    summary:summary(issue,codes.join(", "),"add multiple")
  };
}

// Telegram Issue authors are the bot credential, never the contributor.
// Only a new, consented, strictly attributed code can auto-publish as unverified.
// This is never GitHub account ownership or proof of working redemption.
export function planTelegramIssue(issue, current) {
  const title=/^\[(?:Invite|Telegram submission)\] ([A-Z0-9]{6})$/.exec(String(issue.title||""));
  const body=String(issue.body||"");
  const marker=/<!-- muse-telegram-submission:([A-Z0-9]{6}) -->/.exec(body);
  if(!title || !marker || title[1]!==marker[1])return {outcome:"needs-review",kind:"invite",reason:"Telegram title/marker mismatch; human review required."};
  if(!["hoangsvit","eplus-bot"].includes(issue.user?.login))return {outcome:"needs-review",kind:"invite",code:title[1],reason:"Unrecognized Telegram bot Issue author."};
  const fields=readIssueFields(body);
  const code=title[1];
  if(field(fields,"Invite code").trim()!==code || field(fields,"Code source").trim()!==TELEGRAM_COMMUNITY)
    return {outcome:"needs-review",kind:"invite",code,reason:"Telegram code or source field mismatch."};
  if(!hasRequiredInviteConfirmations(body) ||
      !field(fields,"Contributor checklist").includes("- [x] I am authorized to share this code publicly; I understand this Issue is public."))
    return {outcome:"needs-review",kind:"invite",code,reason:"Telegram contributor public-sharing/privacy confirmation is missing."};
  const context=field(fields,"Public confirmation or context (optional)").trim();
  const standard=title[0].startsWith("[Invite]");
  // The normal Share Code form fields carry the Telegram identity. No custom
  // headings are needed, and the bot's GitHub account is never the sender.
  const notes=field(fields,"Notes (optional)").trim();
  const standardWho=/^Submitted via Telegram by @([A-Za-z][A-Za-z0-9_]{4,31})\. (?:Human review required|Community report); public profile is not proof of code ownership, redemption or quota\.$/.exec(notes);
  const legacyWho=/^@([A-Za-z][A-Za-z0-9_]{4,31}) \(Telegram sender, public attribution accepted during confirmation\)$/.exec(field(fields,"Telegram contributor").trim());
  const legacyUrl=/^(https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}) \(Telegram profile only, not source-post evidence\)$/.exec(context);
  const who=standard?standardWho:legacyWho;
  const source=parsePublicSource(standard?context:(legacyUrl?.[1]||""));
  if(!who || !source || source.platform!=="Telegram" || source.post || source.handle!==who[1])
    return {outcome:"needs-review",kind:"invite",code,reason:"Missing or mismatched consented Telegram username/profile."};
  // Telegram identity cannot authorize self-reported owner-only quota fields.
  for(const label of ["Uses so far (optional; self-reported)","Invite limit (optional; self-reported)","Remaining invites (optional; self-reported)"]) {
    const value=field(fields,label);
    if(value && !explicitlyUnreported(value))return {outcome:"needs-review",kind:"invite",code,reason:"Telegram cannot authenticate owner-only quota."};
  }
  const listed=findCode(current,code);
  if(listed){
    const canonicalIssueNumber=originalIssueNumber(listed);
    if (canonicalIssueNumber===issue.number && listed.sourceUrl!==source.url){
      return {outcome:"needs-review",kind:"invite",code,canonicalIssueNumber,
        reason:"Original Telegram source differs from the catalog; manual review is required."};
    }
    return canonicalIssueNumber===issue.number
      ? {outcome:"already-published",kind:"invite",code,canonicalIssueNumber,
          reason:"This original Telegram contribution is already in the catalog."}
      : {outcome:"already-listed",kind:"invite",code,canonicalIssueNumber,
          reason:"Invite code is already in the catalog; no second record will be added."};
  }
  const id="community-issue-"+issue.number;
  if(current.some(entry=>entry.id===id || entry.feedbackIssueNumber===issue.number))
    return {outcome:"needs-review",kind:"invite",code,reason:"A catalog record is already associated with this Issue."};
  const date=reportDate({...issue,updated_at:issue.created_at});
  const record={id,code,status:"unverified",addedAt:date,
    feedbackIssueNumber:issue.number,sourceUrl:source.url,
    note:"Telegram community report in Issue #"+issue.number+"; source ownership, Muse redemption and remaining capacity unverified."};
  const data=structuredClone(current);
  const index=data.findIndex(entry=>entry.featured!==true);
  data.splice(index<0?data.length:index,0,record);
  const errors=validateCatalog(data);
  if(errors.length)throw Error("Telegram draft record failed catalog validation: "+errors.join("; "));
  return {outcome:"proposal",kind:"invite",code,action:"add Telegram source",data,
    branch:"auto/issue-"+issue.number+"-invite",
    notice:"Telegram sender @"+source.handle+" supplied a public profile only, not proof of code ownership or a source post. This community report can auto-publish only as unverified after independent Issue, record, duplicate and CI checks; owner quotas and Muse redemption are not verified.",
    summary:summary(issue,code,"add Telegram community report")};
}

export function planIssueChange(issue, current, {deferValidation=false}={}) {
  if (!Number.isSafeInteger(issue?.number) || issue.number <= 0) throw Error("Invalid Issue number.");
  if (!Array.isArray(current)) throw Error("Expected a catalog array.");
  if (!USER_PATTERN.test(issue.user?.login || "")) throw Error("Invalid contributor username.");
  const title = String(issue.title || "").trim();
  // Match the trusted Telegram contribution route before general Issue Form parsing.
  // Never interpret the GitHub bot Issue author as the invite owner.
  if (title.startsWith("[Telegram submission]") ||
      String(issue.body||"").includes("<!-- muse-telegram-submission:")) {
    return planTelegramIssue(issue,current);
  }
  const kind = title.startsWith("[Count update]") ? "count" :
    title.startsWith("[Code feedback]") ? "feedback" :
    title.startsWith("[Invite]") || isShareCodeIssue(issue) ? "invite" : null;
  if (!kind) return { outcome:"unsupported", reason:"Issue does not use a supported Muse Invite Hub form." };
  const f = readIssueFields(issue.body);
  const codes = codesFrom(f);
  if (kind !== "invite" && codes.length !== 1) {
    throw Error("Count/feedback Issues must reference exactly one Invite code.");
  }
  if (kind === "invite" && codes.length > 1) {
    return planMultiInvite(issue, current, codes, f);
  }
  const code = codes[0];
  const existing = findCode(current, code);
  // New invite codes keep their original submission date. Comments,
  // automated labels and maintainer replies must not change addedAt.
  const date = kind === "invite" && !existing
    ? reportDate({...issue,updated_at:issue.created_at}) : reportDate(issue);
  const data = structuredClone(current);
  let action, notice = "";
  if (kind === "count" || kind === "feedback") {
    const platform = field(f, "Listing platform").trim();
    // Older Issue Forms had no platform selector. Retain their code-based behavior
    // while enforcing the explicit platform in all new submissions.
    if (platform && !LISTING_PLATFORMS.includes(platform)) {
      return {outcome:"needs-review",kind,code,
        reason:"Listing platform must be GitHub, Threads, X (Twitter) or Facebook."};
    }
    if (existing && platform) {
      const listedPlatform = listedPlatformOf(existing);
      if (platform !== listedPlatform) {
        return {outcome:"needs-review",kind,code,
          reason:"Selected platform does not match the catalog listing (" + listedPlatform +
            "). Same usernames on GitHub and Threads are distinct accounts; select the code's actual source."};
      }
    }
  }
  if (kind === "invite") {
    if (!hasRequiredInviteConfirmations(issue.body)) {
      throw Error("Contributor permission and privacy confirmations are required.");
    }
    const selectedSource = field(f,"Code source").trim();
    if (selectedSource && !SUBMISSION_PLATFORMS.has(selectedSource)) {
      return {outcome:"needs-review",kind,code,
        reason:"Choose GitHub, Threads, X (Twitter) or Facebook as the code source."};
    }
    const githubFallback = isUnattributedHumanTelegramIssue(issue,f);
    const sourcePlatform = githubFallback ? "GitHub" :
      SUBMISSION_PLATFORMS.get(selectedSource) || "GitHub";
    if (sourcePlatform === "Telegram") {
      return {outcome:"needs-review",kind,code,
        reason:"A GitHub Issue selecting Telegram with a Telegram handle or link needs manual source review; submit through the bot for confirmed Telegram attribution."};
    }
    if (githubFallback && (
      ["Invite limit (optional; self-reported)", "Uses so far (optional; self-reported)",
        "Remaining invites (optional; self-reported)"].some(name => field(f,name).trim()) ||
      /\b[0-9]+\s+(?:uses?|invites?)\s+(?:left|remaining)\b/i.test(field(f,"Notes (optional)"))
    )) {
      return {outcome:"needs-review",kind,code,
        reason:"GitHub fallback cannot treat Telegram-selected quota figures as owner-confirmed; remove the quota claim or request maintainer review."};
    }
    const socialSubmission = sourcePlatform !== "GitHub";
    const urlField = field(f,SOCIAL_FIELD).trim() || field(f,THREADS_FIELD).trim();
    // Legacy issues omitted source selection; never claim public social URLs
    // belong to a GitHub Issue reporter simply because the handles match.
    const legacyUrl = field(f,"Public confirmation or context (optional)").trim();
    if (!selectedSource && parsePublicSource(legacyUrl)) {
      return {outcome:"needs-review",kind,code,
        reason:"Legacy social-source Issues require platform selection and maintainer review."};
    }
    // The social URL input is not applicable for "GitHub (my own code)".
    // A contributor may explicitly say that they have no social source.
    // Never treat an actual pasted link, handle or unrecognized claim as
    // an absence statement: those still need manual source review.
    if (!socialSubmission && urlField && !explicitlyNoSocialSource(urlField)) {
      return {outcome:"needs-review",kind,code,
        reason:"Choose the matching social code source when supplying a social URL."};
    }
    const social = socialSubmission ? parsePublicSource(urlField) : null;
    if (socialSubmission && (!social || social.platform !== sourcePlatform)) {
      return {outcome:"needs-review",kind,code,
        reason:"Provide an HTTPS public profile or post URL matching the selected social platform."};
    }
    if (socialSubmission && !social.post) {
      return {outcome:"needs-review",kind,code,
        reason:"A social profile alone cannot prove a code was posted. Supply the original public post URL for maintainer review."};
    }
    if (socialSubmission && ["Invite limit (optional; self-reported)",
        "Uses so far (optional; self-reported)",
        "Remaining invites (optional; self-reported)"].some(label => field(f,label).trim())) {
      return {outcome:"needs-review",kind,code,
        reason:"Third-party social reports cannot claim owner-only quota numbers."};
    }
    if (existing) {
      // Replaying the SAME original social submission after its reviewed record
      // reached main is idempotent, not a cross-platform hijack. Require an
      // exact canonical Issue, record ID and unchanged validated permalink.
      // Different Issues or changed sources still require manual review.
      if (socialSubmission &&
          existing.id === "community-issue-" + issue.number &&
          existing.feedbackIssueNumber === issue.number &&
          existing.sourceUrl === social.url) {
        return {outcome:"already-published",kind,code,canonicalIssueNumber:issue.number,
          reason:"The submitted code and source are already in the main catalog from this Issue."};
      }
      const canonicalIssueNumber=originalIssueNumber(existing);
      // Different-source submissions are duplicates only when they do not
      // attempt to supply owner-only quota figures. Never discard claims
      // needing human validation by silently closing their Issues.
      const hasQuotaClaim=["Invite limit (optional; self-reported)",
        "Uses so far (optional; self-reported)",
        "Remaining invites (optional; self-reported)"].some(label=>field(f,label).trim());
      if (!socialSubmission && hasQuotaClaim &&
          (parsePublicSource(existing.sourceUrl) || !ownerMatches(existing,issue))) {
        return {outcome:"needs-review",kind,code,
          reason:"A different source or owner reported quota numbers; manual review is required."};
      }
      if (socialSubmission || parsePublicSource(existing.sourceUrl) || !ownerMatches(existing,issue)) {
        // A second submission of an existing CODE does not replace attribution
        // or ownership. Give its author the existing listing/Issue link and
        // close the duplicate; do not publish a competing record.
        if (canonicalIssueNumber===issue.number){
          return {outcome:"needs-review",kind,code,
            reason:"Original Issue now reports a different source or owner; maintainer review required."};
        }
        return {outcome:"already-listed",kind,code,canonicalIssueNumber,
          reason:"Invite code is already listed. New source/ownership claims were not adopted."};
      }
      const quota=actualQuota(f,date,{
        total:"Invite limit (optional; self-reported)",
        used:"Uses so far (optional; self-reported)",
        remaining:"Remaining invites (optional; self-reported)",
        notes:"Notes (optional)"
      });
      if (!quota){
        return canonicalIssueNumber===issue.number
          ? {outcome:"already-published",kind,code,canonicalIssueNumber,
              reason:"The existing original code was already published; there is no new quota."}
          : {outcome:"already-listed",kind,code,canonicalIssueNumber,
              reason:"Invite code already exists; use its original discussion for updates."};
      }
      // Reuse only the owner's already reviewed, complete dated capacity.
      // This matches the legacy Count update and canonical comment flows.
      // Never assume the project maximum (30) is an individual allocation.
      let reviewedQuota=quota;
      if (quota.reportedRemaining !== undefined &&
          Number.isInteger(existing.reportedCapacity) &&
          Number.isInteger(existing.reportedUses) &&
          existing.reportedCapacity > 0 &&
          existing.reportedCapacity <= MAX_INVITES_PER_CODE &&
          existing.reportedUses >= 0 &&
          existing.reportedUses <= existing.reportedCapacity &&
          typeof existing.usageReportedAt === "string") {
        if (quota.reportedRemaining > existing.reportedCapacity) {
          return {outcome:"needs-review",kind,code,
            reason:"Remaining invites exceed the existing reviewed total; provide both remaining and used from Muse, or request manual review."};
        }
        reviewedQuota={
          reportedCapacity:existing.reportedCapacity,
          reportedUses:existing.reportedCapacity-quota.reportedRemaining,
          usageReportedAt:date
        };
        notice="The owner reported remaining "+quota.reportedRemaining+
          "; total "+existing.reportedCapacity+" came from an earlier reviewed snapshot, "+
          "and used "+reviewedQuota.reportedUses+" is derived. This is not a live Muse balance.";
      } else {
        notice="The GitHub owner updated a dated self-reported count; "+
          (quota.reportedCapacity!==undefined
            ?"the total is derived from their remaining and used figures. "
            :"only remaining is known; no total is assumed. ")+
          "This is NOT a live Muse balance.";
      }
      const target=data.find(item=>item.code===existing.code);
      const state=updateQuota(target,reviewedQuota,date);
      if(state!=="updated") return quotaUpdateBlocked(state,kind,code);
      rememberOwnerId(target,issue);
      action="update owner report";
    } else {
      const id = "community-issue-" + issue.number;
      if (data.some(item => item.id === id)) throw Error("Catalog ID already exists.");
      const entry = {
        id, code, status:"unverified", addedAt:date,
        feedbackIssueNumber:issue.number,
        ...(socialSubmission
          ? {sourceUrl:social.url, note:"Public "+social.platform+" code reported in issue #"+issue.number+
              "; original post content and Muse redemption are unverified community reports."}
          : {submittedBy:issue.user.login,
              note:githubFallback
                ? "Reported in GitHub Issue #"+issue.number+" with Telegram selected but no public Telegram sender/source. GitHub reporter is not a verified code owner; redemption and quota are unverified."
                : "Community-submitted in issue #"+issue.number+
                    "; redemption not independently verified."})
      };
      if (!socialSubmission) {
        if (githubFallback) {
          notice="Telegram was selected without a public sender or source. "+
            "Attribution falls back to GitHub Issue reporter @"+issue.user.login+
            " (not a verified code owner). A review-only Draft PR is required; "+
            "no owner quotas or Muse redemption have been verified.";
        } else {
          rememberOwnerId(entry,issue);
          const reported=actualQuota(f,date,{
            total:"Invite limit (optional; self-reported)",
            used:"Uses so far (optional; self-reported)",
            remaining:"Remaining invites (optional; self-reported)",
            notes:"Notes (optional)"
          });
          if (reported) Object.assign(entry,reported);
          else notice="Usage numbers were absent or incomplete; no available-slot count has been guessed.";
        }
      } else if (social.group) {
        notice="Facebook group "+social.handle+" is the cited source, NOT the post author's identity or a verified code owner. "+
          "The submitted group post has not been independently verified; a maintainer must check it manually before publication.";
      } else {
        notice=social.platform+" @"+social.handle+" is the cited public source, NOT the GitHub reporter or a verified code owner. "+
          "This is a contributor-supplied post URL, NOT independently verified; visitors must check it themselves. Do NOT invent availability or redemption results.";
      }
      const firstCommunity=data.findIndex(item=>item.featured!==true);
      data.splice(firstCommunity<0?data.length:firstCommunity,0,entry);
      action=socialSubmission?"add "+social.platform+" source":"add";
    }
  } else if (kind === "count") {
    if (!existing) return { outcome:"needs-review",kind,code,reason:"Code not yet in the catalog; report requires manual triage." };
    const confirmation = field(f,"Confirmation");
    if (!confirmation.includes("[x] I confirm that these figures came from a Muse invite screen")) {
      throw Error("The owner must confirm the figures came from their Muse invite screen.");
    }
    if (parsePublicSource(existing.sourceUrl)) {
      return {outcome:"needs-review",kind,code,
        reason:"Social attribution does not prove GitHub ownership. Owner quota updates for social codes require manual verification."};
    }
    if (!ownerMatches(existing,issue)) {
      return { outcome:"needs-review",kind,code,reason:"Only the cataloged code owner may submit a quota proposal automatically." };
    }
    let quota = actualQuota(f,date,{
      total:"Total invite quota shown by Muse (if known)",
      used:"Already used invites (if known)",
      remaining:"Remaining invites shown by Muse"
    });
    if (!quota) return { outcome:"needs-review",kind,code,reason:"Supply remaining invites or a consistent total and used count." };
    // A same-owner, explicitly confirmed remaining-only report may reuse the
    // previously published *known* capacity. Preserve that capacity rather
    // than replacing a complete snapshot with reportedRemaining. Derive used
    // arithmetically, and make the provenance explicit for human review.
    // Missing or inconsistent historical capacity still needs manual review.
    if (quota.reportedRemaining !== undefined &&
        Number.isInteger(existing.reportedCapacity) &&
        Number.isInteger(existing.reportedUses) &&
        existing.reportedCapacity > 0 &&
        existing.reportedUses >= 0 &&
        existing.reportedUses <= existing.reportedCapacity &&
        typeof existing.usageReportedAt === "string") {
      if (quota.reportedRemaining > existing.reportedCapacity) {
        return {outcome:"needs-review",kind,code,
          reason:"Remaining invites exceed the previously published total. Confirm the new total before updating."};
      }
      const inheritedCapacity=existing.reportedCapacity;
      quota={
        reportedCapacity:inheritedCapacity,
        reportedUses:inheritedCapacity-quota.reportedRemaining,
        usageReportedAt:date
      };
      notice="The owner confirmed remaining invites from their Muse screen. "+
        "Total "+inheritedCapacity+" was retained from the previous published snapshot; "+
        "used "+quota.reportedUses+" was derived as total minus remaining. "+
        "These are dated owner-reported figures, NOT a live Muse balance.";
    }
    if (quota.reportedCapacity !== undefined &&
        !field(f,"Total invite quota shown by Muse (if known)").trim() &&
        field(f,"Remaining invites shown by Muse").trim() &&
        field(f,"Already used invites (if known)").trim()) {
      const formerTotal=existing.reportedCapacity;
      notice="The owner reported remaining "+(quota.reportedCapacity-quota.reportedUses)+
        " and used "+quota.reportedUses+"; total "+quota.reportedCapacity+
        " was calculated as their sum (not presumed to be the 30-slot maximum). "+
        (Number.isInteger(formerTotal) && formerTotal!==quota.reportedCapacity
          ? "This differs from the previously published total "+formerTotal+
            "; verify the change before merging. " : "")+
        "This is a dated self-report, NOT a live Muse balance.";
    }
    const target=data.find(item=>item.code===existing.code);
    const state=updateQuota(target,quota,date);
    if(state!=="updated") return quotaUpdateBlocked(state,kind,code);
    rememberOwnerId(target,issue);
    action = "update quota";
  } else {
    if (!existing) return {outcome:"needs-review",kind,code,reason:"Code not in the catalog; feedback needs manual review."};
    const reason=field(f,"What happened?");
    const next = reason === "Muse accepted the code (worked for me)" ? "reported-working" :
      reason === "Muse did not accept the code" || reason === "Muse says it is used or exhausted"
        ? "reported-not-working" : null;
    if (!next) return {outcome:"needs-review",kind,code,reason:"Feedback is informational; no automatic status proposal for this reason."};
    const target=data.find(item=>item.code===existing.code);
    if (target.status===next && target.checkedAt===date) {
      return {outcome:"duplicate",kind,code,reason:"The published catalog already has this dated feedback."};
    }
    target.status=next;
    target.checkedAt=date;
    if (target.featured && next==="reported-not-working") {
      return {outcome:"needs-review",kind,code,reason:"Feedback on the featured owner code needs special maintainer review."};
    }
    action="review reported status";
    notice="This is one contributor's report, NOT confirmation by Muse and NOT evidence of global redemption availability.";
  }
  const errs=deferValidation ? [] : validateCatalog(data);
  if(errs.length) throw Error("Generated catalog failed validation: "+errs.join("; "));
  return {outcome:"proposal",kind,code,action,data,notice,
    branch:"auto/issue-"+issue.number+"-"+kind,summary:summary(issue,code,action)};
}

// Automatically publish only genuinely *new*, self-reported GitHub codes.
// Consent must come from the contributor. Social sources, quota updates,
// code feedback, malformed/ambiguous Issues, and existing-code updates stay
// in the human-review queue. The published status remains "unverified".
export function isAutoPublishableNewGithubInvite(issue,proposal) {
  if (!issue || issue.state !== "open" || issue.pull_request ||
      !proposal || proposal.outcome !== "proposal" ||
      proposal.kind !== "invite" ||
      !(proposal.action === "add" || /^add (?:[2-9]|10) codes$/.test(proposal.action))) {
    return false;
  }
  const fields = readIssueFields(issue.body);
  if (field(fields,"Code source").trim() !== GITHUB_OWN ||
      !hasRequiredInviteConfirmations(issue.body)) return false;
  const codes = proposal.codes || [proposal.code];
  if (codes.length < 1 || codes.length > 10 ||
      new Set(codes).size !== codes.length) return false;
  return codes.every(code => {
    const item = proposal.data.find(row => row.code === code);
    const expectedId = codes.length === 1
      ? "community-issue-"+issue.number
      : "community-issue-"+issue.number+"-"+code.toLowerCase();
    return item && item.id === expectedId &&
      item.feedbackIssueNumber === issue.number &&
      item.status === "unverified" &&
      item.submittedBy === issue.user?.login &&
      item.sourceUrl === undefined &&
      item.ownerConfirmed !== true &&
      item.featured !== true;
  });
}

// Public-post reports can be listed as unverified without independently
// verifying their remote post contents. The reporter's checklist is required;
// the URL must still be a strict HTTPS permalink on the selected platform.
// Do not confer ownership or allow counts, existing-code updates or multi-code
// social claims through this automatic path.
export function isAutoPublishableNewSocialInvite(issue,proposal) {
  if (!issue || issue.state!=="open" || issue.pull_request ||
      !proposal || proposal.outcome!=="proposal" || proposal.kind!=="invite" ||
      !hasRequiredInviteConfirmations(issue.body)) return false;
  const f=readIssueFields(issue.body);
  const selected=field(f,"Code source").trim();
  if (![THREADS_FOUND,X_FOUND,FACEBOOK_FOUND].includes(selected)) return false;
  const platform=SUBMISSION_PLATFORMS.get(selected);
  const urlField=field(f,SOCIAL_FIELD).trim() || field(f,THREADS_FIELD).trim();
  const social=parsePublicSource(urlField);
  // Group permalinks identify the group but cannot establish the post author.
  // Do not auto-publish them, even when the URL and submitter checklist are valid.
  if (!social?.post || social.group || social.platform!==platform ||
      proposal.action!=="add "+platform+" source") return false;
  if (["Invite limit (optional; self-reported)","Uses so far (optional; self-reported)",
       "Remaining invites (optional; self-reported)"].some(k=>field(f,k).trim())) return false;
  const codes=proposal.codes||[proposal.code];
  if(codes.length!==1) return false;
  const entry=proposal.data.find(row=>row.code===codes[0]);
  return Boolean(entry &&
    entry.id==="community-issue-"+issue.number &&
    entry.feedbackIssueNumber===issue.number &&
    entry.sourceUrl===social.url &&
    entry.status==="unverified" &&
    entry.submittedBy===undefined && entry.submittedById===undefined &&
    entry.ownerConfirmed!==true && entry.featured!==true &&
    entry.reportedUses===undefined && entry.reportedCapacity===undefined &&
    entry.reportedRemaining===undefined);
}

// Bot-submitted Telegram codes use the same guarded unverified publication
// as public social reports. The profile confirms attribution format only:
// it never establishes ownership, redeemed invites or remaining quota.
export function isAutoPublishableNewTelegramInvite(issue,proposal) {
  if (!issue || issue.state!=="open" || issue.pull_request ||
      !proposal || proposal.outcome!=="proposal" || proposal.kind!=="invite" ||
      proposal.action!=="add Telegram source" ||
      !hasRequiredInviteConfirmations(issue.body)) return false;
  const parsed=planTelegramIssue(issue,[]);
  if (parsed.outcome!=="proposal" || parsed.code!==proposal.code ||
      (proposal.codes||[proposal.code]).length!==1) return false;
  const fields=readIssueFields(issue.body);
  const raw=field(fields,"Public confirmation or context (optional)").trim();
  const legacy=/^(https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}) \(Telegram profile only, not source-post evidence\)$/.exec(raw);
  const source=parsePublicSource(legacy?.[1]||raw);
  const entry=proposal.data.find(row=>row.code===proposal.code);
  return Boolean(source?.platform==="Telegram" && !source.post &&
    entry && entry.id==="community-issue-"+issue.number &&
    entry.feedbackIssueNumber===issue.number &&
    entry.sourceUrl===source.url && entry.sourceUrl===parsed.data.find(row=>row.code===proposal.code)?.sourceUrl &&
    entry.status==="unverified" && entry.submittedBy===undefined &&
    entry.submittedById===undefined && entry.ownerConfirmed!==true &&
    entry.featured!==true && entry.reportedUses===undefined &&
    entry.reportedCapacity===undefined && entry.reportedRemaining===undefined);
}

const apiRoot="https://api.github.com/repos/"+REPO+"/";
async function api(method,path,token,payload,allow404=false) {
  const response = await fetch(apiRoot+path,{
    method,
    headers:{
      Authorization:"Bearer "+token,
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      ...(payload===undefined?{}:{"Content-Type":"application/json"})
    },
    ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
    signal:AbortSignal.timeout(25000)
  });
  if (allow404 && response.status===404) return null;
  if (!response.ok) {
    const error=await response.text();
    throw Error("GitHub "+method+" "+path+" returned HTTP "+response.status+
      ": "+error.slice(0,350));
  }
  if(response.status===204)return null;
  return response.json();
}
async function comment(issue,token,body) {
  const messages=await api("GET","issues/"+issue.number+"/comments?per_page=100",token);
  // Only edit comments owned by the current authenticated eplus-bot.
  // It cannot PATCH legacy github-actions[bot] comments (GitHub HTTP 403).
  const previous=messages.find(entry=>entry.user?.login==="eplus-bot"&&
    entry.body?.includes(MARKER));
  const text=MARKER+"\n"+body;
  if(previous){
    await api("PATCH","issues/comments/"+previous.id,token,{body:text});
  } else {
    await api("POST","issues/"+issue.number+"/comments",token,{body:text});
  }
}
async function getCatalog(token,sha){
  return fetchGitHubCatalog((path,allow404=false)=>
    api("GET",path,token,undefined,allow404),sha);
}
async function openBotPrs(token){
  const result=await api("GET","pulls?state=open&per_page=100",token);
  return result.filter(pr=>pr.head?.repo?.full_name===REPO);
}
// Never close a new Issue merely because a 6-character token appeared in it.
// The trusted planner must first establish a valid, fully submitted invite,
// an exact catalog match, and an existing canonical discussion or live detail.
export function resolvedInviteComment({codes,canonicalIssueNumbers=[],liveCodes=[],canonical=false}){
  const list=codes.join(", ");
  const siteLinks=liveCodes.map(code=>"[View "+code+"](https://muse.eplus.dev/codes/"+code+"/)");
  const issueLinks=canonicalIssueNumbers.map(n=>"[Issue #"+n+"](https://github.com/"+REPO+"/issues/"+n+")");
  return [
    canonical ? "✅ **This original contribution has been published.**" :
      "ℹ️ **Duplicate invite submission — already tracked.**",
    "",
    "**Invite code"+(codes.length>1?"s":"")+":** "+list,
    ...(siteLinks.length ? ["**Published detail"+(siteLinks.length>1?"s":"")+":** "+siteLinks.join(" · ")] : []),
    ...(issueLinks.length ? ["**Original discussion"+(issueLinks.length>1?"s":"")+":** "+issueLinks.join(" · ")] : []),
    "",
    canonical ? "Closing the completed submission; its original Issue can be reopened for new feedback." :
      "Closing this duplicate so that feedback stays in the original discussion. This submission does not change the listing's attribution or quota.",
    "Being listed does **not** mean Muse has verified redemption, eligibility or available invitations."
  ].join("\n");
}

async function publishedDetailReady(code){
  if (!CODE_PATTERN.test(code)) return false;
  const url="https://muse.eplus.dev/codes/"+code+"/";
  try {
    const response=await fetch(url+"?duplicate-check=1",{
      cache:"no-store",signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)return false;
    const body=await response.text();
    return body.includes("<title>"+code+" Muse Invite Code | Muse Invite Hub</title>") &&
      body.includes('rel="canonical" href="'+url+'"') &&
      !body.includes('name="robots" content="noindex');
  } catch {return false;}
}

async function resolveListedInvite(issue,result,token){
  const codes=result.codes||[result.code];
  if(!codes.length || codes.some(code=>!CODE_PATTERN.test(code)))return result;
  const canonical=result.outcome==="already-published";
  const refs=result.canonicalIssueNumbers||
    (Number.isSafeInteger(result.canonicalIssueNumber)?[result.canonicalIssueNumber]:[]);
  const originalRefs=[];
  for(const n of [...new Set(refs)]){
    if(!Number.isSafeInteger(n) || n<1 || n===issue.number)continue;
    const original=await api("GET","issues/"+n,token);
    if(!original.pull_request && codes.some(code=>issueCodes(original).includes(code))){
      originalRefs.push(n);
    }
  }
  const liveCodes=[];
  for(const code of codes)if(await publishedDetailReady(code))liveCodes.push(code);
  // The original submission closes only when all its pages are actually live.
  // A duplicate can instead point to a separately confirmed original Issue.
  if ((canonical && liveCodes.length!==codes.length) ||
      (!canonical && liveCodes.length!==codes.length && !originalRefs.length)){
    await comment(issue,token,"The invite code"+(codes.length>1?"s are":" is")+
      " already in the main catalog. Keeping this Issue open until a published "+
      "detail or original discussion can be verified; no new PR was created.");
    return {...result,outcome:"pending-publication"};
  }
  const latest=await api("GET","issues/"+issue.number,token);
  if(latest.state!=="open" || latest.title!==issue.title || latest.body!==issue.body){
    return {...result,outcome:"skipped",reason:"Issue changed while resolving duplicate."};
  }
  await comment(issue,token,resolvedInviteComment({
    codes,canonicalIssueNumbers:originalRefs,liveCodes,canonical
  }));
  await api("PATCH","issues/"+issue.number,token,{
    state:"closed",state_reason:canonical?"completed":"duplicate"
  });
  return {...result,outcome:canonical?"closed-completed":"closed-duplicate"};
}

async function propose(issue,token) {
  if(issue.state!=="open" || issue.pull_request) return {outcome:"skipped",reason:"Issue not open."};
  const ref=await api("GET","git/ref/heads/main",token);
  const mainSHA=ref.object.sha;
  const roots=JSON.parse(readFileSync(new URL("../data/code-issues.json",import.meta.url),"utf8"));
  const catalog=withCanonicalIssueRefs(await getCatalog(token,mainSHA),roots);
  const proposed=planIssueChange(issue,catalog);
  if(proposed.outcome!=="proposal")return proposed;

  // Multi-code Issues create one Draft PR but independent JSON records.
  // Disallow overlap with other active automated proposals, even when those
  // proposals contain multiple codes.
  const codes=proposed.codes || [proposed.code];
  const codesLabel=codes.join(", ");
  const prs=await openBotPrs(token);
  const matching=prs.find(pr=>pr.head.ref===proposed.branch);
  if(matching)return {outcome:"already-open",url:matching.html_url,code:codesLabel};
  for (const pr of prs.filter(pr=>pr.head.ref.startsWith("auto/"))) {
    const title=/^data: review (.+) (?:invite|count|feedback) \(issue #[1-9][0-9]*\)$/.exec(String(pr.title || ""));
    const listed=title ? title[1].split(", ") : [];
    if (codes.some(code=>listed.includes(code))) {
      return {outcome:"needs-review",code:codesLabel,
        reason:"Another open automated PR already changes one of these codes: "+pr.html_url};
    }
  }

  // Never overwrite an existing branch. A branch left behind after a
  // repository-level PR permission denial can be retried without rewriting it.
  const encoded=proposed.branch.split("/").map(encodeURIComponent).join("/");
  const existing=await api("GET","git/ref/heads/"+encoded,token,undefined,true);
  if(existing){
    const prepared=await getCatalog(token,existing.object.sha);
    if(codes.some(code=>JSON.stringify(prepared.find(x=>x.code===code)) !==
       JSON.stringify(proposed.data.find(x=>x.code===code)))){
      return {outcome:"needs-review",code:proposed.code,
        reason:"An older automation branch exists with different data. A maintainer must reconcile it; the bot will not overwrite history."};
    }
  }
  if (!existing) {
    // The branch tree is sourced from the exact current trusted main commit.
    const base=await api("GET","git/commits/"+mainSHA,token);
    const records=codes.length===1
      ? [changedRecord(catalog,proposed.data,proposed.code)]
      : changedRecords(catalog,proposed.data,codes);
    const entries=[];
    for (const record of records) {
      const blob=await api("POST","git/blobs",token,{content:record.content,encoding:"utf-8"});
      entries.push({path:record.path,mode:"100644",type:"blob",sha:blob.sha});
    }
    const tree=await api("POST","git/trees",token,{
      base_tree:base.tree.sha,
      tree:entries
    });
    const commit=await api("POST","git/commits",token,{
      message:"data: "+proposed.action+" "+codesLabel+" (issue #"+issue.number+")",
      tree:tree.sha,parents:[mainSHA]
    });
    await api("POST","git/refs",token,{ref:"refs/heads/"+proposed.branch,sha:commit.sha});
  }
  const socialAutoPublish=isAutoPublishableNewSocialInvite(issue,proposed);
  const telegramAutoPublish=isAutoPublishableNewTelegramInvite(issue,proposed);
  const autoPublish=isAutoPublishableNewGithubInvite(issue,proposed)||
    socialAutoPublish||telegramAutoPublish;
  const title="data: review "+codesLabel+" "+proposed.kind+" (issue #"+issue.number+")";
  const sourceFields=readIssueFields(issue.body);
  const telegramSource=parsePublicSource(sourceFields["Public confirmation or context (optional)"]||"");
  const telegramAttribution=telegramSource?.platform==="Telegram"
    ? "@"+telegramSource.handle
    : sourceFields["Telegram contributor"]?.split(" ")[0]||"unknown";
  const body=[
    autoPublish ? (telegramAutoPublish ? AUTO_PUBLISH_NEW_TELEGRAM_INVITE_MARKER
      : socialAutoPublish ? AUTO_PUBLISH_NEW_SOCIAL_INVITE_MARKER
      : AUTO_PUBLISH_NEW_INVITE_MARKER) : "",
    autoPublish ? "## Automated community submission — automatic publication after validation" :
      "## Automated draft proposal",
    "",
    proposed.action==="add Telegram source"
      ? "Prepared from consented Telegram contributor "+telegramAttribution+" in public Issue #"+issue.number+". GitHub Issue author @"+issue.user.login+" is the bot credential, not the code owner."
      : "Prepared from public Issue #"+issue.number+" by @"+issue.user.login+".",
    (codes.length===1?"Code: **":"Codes: **")+codesLabel+"**. Change: **"+proposed.action+"**.",
    "",
    proposed.notice || "All published figures remain dated community/owner reports, never live Muse availability.",
    "",
    ...(autoPublish
      ? ["### Automatic publication checks",
         telegramAutoPublish
           ? "- [x] Bot-issued Telegram marker, consented public @username and matching t.me profile; this is not ownership proof"
           : socialAutoPublish
             ? "- [x] Reporter selected a syntactically valid public post URL and checked both confirmations"
             : "- [x] Contributor selected GitHub (my own code) and checked both confirmations",
         "- [x] New code only; data generated by the trusted Issue bot",
         "- [ ] Re-check Issue content, exact per-code records, duplicates and current main",
         "- [ ] Full CI must pass for the current PR head",
         "",
         "**Automatically publish as unverified only after all checks pass.** "+
           "This does not independently verify any source post, Telegram profile ownership, Muse redemption or actual code ownership. "+
           "Contributors are responsible for what they submit; visitors must check the original source and code themselves."]
      : ["### Required human checks",
         "- [ ] Verify the submitter, code and any ownership or usage claims",
         proposed.action==="add Telegram source"
           ? "- [ ] Verify the Telegram contributor consent, actual public-sharing permission and invite validity; Telegram profile is NOT ownership/source-post proof"
           : proposed.action.startsWith("add ") && proposed.action.endsWith(" source")
             ? "- [ ] Open the original public social post and confirm it contains this code; for Facebook groups verify the group/post context without assuming the group is the author"
             : "- [ ] Confirm the original GitHub owner attribution and any account-reported quota",
         "- [ ] Review catalog diff, duplicates and contributor attribution",
         "- [ ] CI and security checks pass",
         "- [ ] Confirm website preview after marking the draft ready",
         "",
         "**Do not auto-merge without maintainer authorization.** This is not Muse redemption verification."]),
    "",
    "Tracks Issue #"+issue.number+". The Issue is closed only after the reviewed change is merged, live, and a detail link has been posted."
  ].join("\n");
  // The source Issue may have been deleted while preparing Git objects.
  // A bot must not open a data PR based on a missing or edited submission.
  let latestIssue;
  try {
    latestIssue=await api("GET","issues/"+issue.number,token);
  }catch(error){
    if(error.message.includes("returned HTTP 410:")){
      return {outcome:"skipped",reason:"Source Issue was deleted before PR creation."};
    }
    throw error;
  }
  if(latestIssue.state!=="open" ||
      latestIssue.title!==issue.title || latestIssue.body!==issue.body){
    return {outcome:"skipped",reason:"Source Issue changed or closed before PR creation."};
  }
  let pr;
  try {
    pr=await api("POST","pulls",token,{
      title,head:proposed.branch,base:"main",body,draft:!autoPublish,
      maintainer_can_modify:true
    });
  } catch(error){
    if(/HTTP 403/.test(error.message)){
      await comment(issue,token,"⚠️ A dedicated branch was prepared for **"+proposed.code+
        "**, but GitHub blocked automatic PR creation (HTTP 403). An admin must enable "+
        "**Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** "+
        "then rerun the Issue workflow for #"+issue.number+". No website content was published.");
      return {outcome:"blocked",reason:error.message};
    }
    throw error;
  }
  await comment(issue,token,autoPublish
    ? "Created [PR #"+pr.number+"]("+pr.html_url+") for **"+codesLabel+
      "**. This new "+(telegramAutoPublish?"Telegram community-reported":
        socialAutoPublish?"public-post-reported":"GitHub-sourced")+
      " code is eligible for automatic publication "+
      "as **unverified** after CI, source/consent checks and duplicate checks pass. "+
      "The Issue stays open until successful deployment."
    : "Created [Draft PR #"+pr.number+"]("+pr.html_url+") for **"+codesLabel+
      "**. "+(readIssueFields(issue.body)["Code source"]===TELEGRAM_COMMUNITY &&
        proposed.action!=="add Telegram source"
          ? "No Telegram sender/source was supplied, so the proposal is credited to your GitHub account rather than Telegram. "
          : "")+
      "This submission needs maintainer review; no website data has been published.");
  // Explicitly dispatch validation on the generated branch. GITHUB_TOKEN PR
  // activity does not reliably start an ordinary CI workflow automatically.
  try {
    await api("POST","actions/workflows/validate.yml/dispatches",token,{ref:proposed.branch});
  } catch(error) {
    await comment(issue,token,"Created ["+(autoPublish?"PR":"Draft PR")+" #"+pr.number+"]("+pr.html_url+
      ") for **"+codesLabel+"**, but explicit validation dispatch failed: "+
      error.message.slice(0,220)+". A maintainer must run CI before review.");
  }
  return {outcome:"created",url:pr.html_url,number:pr.number,code:codesLabel};
}
export async function runIssueAutomation({
  number, token=process.env.GH_TOKEN, repository=process.env.GITHUB_REPOSITORY
}={}) {
  if(repository!==REPO)throw Error("Unexpected repository; refusing write actions.");
  if(!token)throw Error("Missing GitHub Actions token.");
  if(!Number.isSafeInteger(number)||number<=0)throw Error("Missing valid Issue number.");
  const issue=await api("GET","issues/"+number,token);
  if (inviteNeedsConfirmationReview(issue)) {
    // GitHub Issue Forms require consent, but API/other clients may omit the
    // checklist entirely. Preserve the contributor's Issue for manual triage.
    // Never synthesize consent, publish a code, or penalize the contributor.
    await comment(issue,token,missingInviteConfirmationGuidance());
    return {outcome:"needs-review",reason:"Missing confirmations in submitted Issue body; retained open for investigation."};
  }
  try{
    const result=await propose(issue,token);
    console.log(JSON.stringify(result));
    if(result.outcome==="needs-review"||result.outcome==="duplicate"){
      await comment(issue,token,"No automatic Draft PR was created for this Issue: "+
        result.reason+". A maintainer can review the report manually. No change has been published.");
    }
    if(result.outcome==="already-published"||result.outcome==="already-listed"){
      const resolved=await resolveListedInvite(issue,result,token);
      console.log("Resolved existing invite Issue: "+JSON.stringify(resolved));
      return resolved;
    }
    if(result.outcome==="already-open"){
      await comment(issue,token,"A [PR]("+result.url+") already exists for this Issue. "+
        "Check the existing proposal; no duplicate branch was created.");
    }
    if(result.outcome==="blocked")process.exitCode=1;
    if(result.outcome!=="created")console.log("No new PR created: "+(result.reason||result.outcome));
    return result;
  } catch(error){
    console.error("Issue #"+number+" could not be proposed: "+error.message);
    if(issue.state==="open"){
      try{
        await comment(issue,token,"⚠️ Draft PR automation could not prepare a safe change: "+
          error.message.slice(0,250)+". Edit the Issue form and retry, or request maintainer review. "+
          "No catalog change was published.");
      }catch(e){console.error("Could not post Issue feedback: "+e.message);}
    }
    throw error;
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const n=Number(process.env.ISSUE_NUMBER);
  await runIssueAutomation({number:n});
}
