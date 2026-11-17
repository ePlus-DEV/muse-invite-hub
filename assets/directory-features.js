/* Browser-only directory helpers. No server account or Muse API access. */
(function (root, factory) {
  "use strict";
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  if (root) root.MuseDirectoryFeatures = helpers;
})(typeof window === "object" ? window : null, function () {
  "use strict";
  const STORAGE_KEY = "muse-invite-hub:saved-codes:v1";
  // Copy history is independent from Saved Codes and never indicates redemption.
  const COPIED_STORAGE_KEY = "muse-invite-hub:copied-codes:v1";
  const REPO = "https://github.com/ePlus-DEV/muse-invite-hub";
  const CODE_PATTERN = /^[A-Z0-9]{6}$/;
  const MAX_SAVED = 200;

  // Deep links are navigation shortcuts, not proof of code redemption.
  function museInviteUrl(code) {
    if (typeof code !== "string" || !CODE_PATTERN.test(code)) {
      throw Error("Invalid Muse invite code");
    }
    return "https://muse.ai/invite/" + encodeURIComponent(code);
  }

  // One billion tokens per qualifying new-user redemption per Muse's
  // September 2026 announcement. Keep the amount in billions for safe display.
  // This is potential based on dated owner/community remaining-use reports,
  // not live available tokens and not a tally of completed redemptions.
  function tokenPotential(records) {
    const list = Array.isArray(records) ? records : [];
    let reportedCodes = 0;
    let remainingUses = 0;
    for (const item of list) {
      if (!item || typeof item.usageReportedAt !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(item.usageReportedAt)) continue;
      let remaining = null;
      if (Number.isSafeInteger(item.reportedRemaining) &&
          item.reportedRemaining >= 0 && item.reportedRemaining <= 1000) {
        remaining = item.reportedRemaining;
      } else if (Number.isSafeInteger(item.reportedCapacity) &&
          Number.isSafeInteger(item.reportedUses) &&
          item.reportedCapacity > 0 && item.reportedCapacity <= 1000 &&
          item.reportedUses >= 0 && item.reportedUses <= item.reportedCapacity) {
        remaining = item.reportedCapacity - item.reportedUses;
      }
      if (remaining === null) continue;
      reportedCodes++;
      remainingUses += remaining;
    }
    return {
      reportedCodes,
      unknownCodes: list.length - reportedCodes,
      remainingUses,
      potentialBillions: remainingUses
    };
  }

  function parseSaved(raw) {
    try {
      const values = JSON.parse(raw);
      if (!Array.isArray(values)) return [];
      return [...new Set(values.filter(value =>
        typeof value === "string" && CODE_PATTERN.test(value)))].slice(0, MAX_SAVED);
    } catch {
      return [];
    }
  }

  function parseCopied(raw) {
    return parseSaved(raw);
  }

  function rememberCopiedCode(storage, code) {
    if (typeof code !== "string" || !CODE_PATTERN.test(code)) return null;
    try {
      const previouslyCopied = parseCopied(storage.getItem(COPIED_STORAGE_KEY));
      const next = [code, ...previouslyCopied.filter(value => value !== code)].slice(0, MAX_SAVED);
      storage.setItem(COPIED_STORAGE_KEY, JSON.stringify(next));
      return next;
    } catch {
      // Clipboard success must still update UI even if browser storage is blocked.
      return null;
    }
  }

  function activityDate(item) {
    // These are dated catalog records, never live redemption signals.
    const dates = [item?.addedAt, item?.usageReportedAt, item?.checkedAt]
      .filter(value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
    return dates.sort().at(-1) || "";
  }

  function compareCodes(a, b, sort) {
    if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
    if (sort === "code") return a.code.localeCompare(b.code);
    const aDate = sort === "updated" ? activityDate(a) : a.addedAt || "";
    const bDate = sort === "updated" ? activityDate(b) : b.addedAt || "";
    const first = sort === "oldest" ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
    return first || (b.addedAt || "").localeCompare(a.addedAt || "") ||
      a.code.localeCompare(b.code);
  }

  const COPY_REPORT_HEADING = "## Muse invite report";
  const FEEDBACK_CHOICES = {
    worked: "Muse accepted my code",
    failed: "Muse rejected or could not redeem my code",
    other: "Other feedback",
    count: "Owner-reported invite count"
  };

  function feedbackComment(code, outcome) {
    if (!CODE_PATTERN.test(code)) throw Error("Invalid public invite code");
    if (!Object.hasOwn(FEEDBACK_CHOICES, outcome)) throw Error("Invalid feedback option");
    if (outcome === "count") {
      return COPY_REPORT_HEADING + "\n\nCode: " + code + "\nUpdate type: Owner count" +
        "\nRemaining invites: [enter actual number or leave blank]" +
        "\nTotal invites: [optional]" +
        "\nUsed invites: [optional]" +
        "\nOwner confirmation: [confirm this report below]";
    }
    return COPY_REPORT_HEADING + "\n\nCode: " + code + "\nResult: " + FEEDBACK_CHOICES[outcome] +
      "\nWhen I tried: [add date]\nDetails: [add non-sensitive context]";
  }

  // On iOS Safari a copied comment starting with "Code:" can be treated as
  // a custom code: URL and pasted as "code:%20...%0A...". Never put a
  // URI-scheme-looking label at the start of copied plain text, even if a
  // contributor removed the generated Markdown heading in the editor.
  function clipboardSafeReport(text) {
    const value = String(text || "").trim();
    return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ?
      COPY_REPORT_HEADING + "\n\n" + value : value;
  }

  function quickFeedbackUrl(code, outcome, issueNumber) {
    if (!CODE_PATTERN.test(code)) throw Error("Invalid public invite code");
    if (!Object.hasOwn(FEEDBACK_CHOICES, outcome)) throw Error("Invalid feedback option");
    // GitHub does not support prefilled comments on existing issues.
    // Never fall back to a new Issue: it would fragment the per-code thread.
    return Number.isSafeInteger(issueNumber) && issueNumber > 0 ?
      REPO + "/issues/" + issueNumber + "#issuecomment-new" : REPO + "/issues";
  }

  function issueNumberFor(map, code) {
    if (!CODE_PATTERN.test(code)) return null;
    const value = map?.[code];
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }


  // Validate the owner report before copying. A template with only placeholder
  // values is not a quota report and must not be mistaken for a submission.
  function prepareOwnerCountComment(text) {
    const fields = {
      "Remaining invites": null,
      "Total invites": null,
      "Used invites": null
    };
    const seen = new Set();
    for (const line of text.split(/\r?\n/)) {
      const hit = /^(Remaining invites|Total invites|Used invites):\s*(.*)$/.exec(line.trim());
      if (!hit) continue;
      const [, name, rawValue] = hit;
      if (seen.has(name)) return {error: "Each invite count should appear only once."};
      seen.add(name);
      const value = rawValue.trim();
      if (!value || /^\[(?:optional|enter actual number or leave blank)\]$/.test(value)) continue;
      if (!/^\d{1,4}$/.test(value) || Number(value) > 1000) {
        return {error: "Use actual whole-number invite counts between 0 and 1000."};
      }
      fields[name] = Number(value);
    }
    const remaining = fields["Remaining invites"];
    const total = fields["Total invites"];
    const used = fields["Used invites"];
    if (remaining === null && (total === null || used === null)) {
      return {error: "Enter your actual Remaining invites number, or both Total invites and Used invites, before copying."};
    }
    if ((total !== null && total < 1) ||
        (total !== null && used !== null && used > total) ||
        (remaining !== null && total !== null && remaining > total) ||
        (remaining !== null && total !== null && used !== null && remaining !== total - used)) {
      return {error: "The counts must be consistent: remaining = total − used."};
    }
    return {
      text: text.replace(/\[enter actual number or leave blank\]|\[optional\]/g, "")
        .replace(/Owner confirmation:.*$/m,
          "Owner confirmation: I confirm these figures came from my own Muse invite screen.")
    };
  }

  // The form generates the canonical text; visitors never need to edit code or
  // placeholder labels just to report their remaining slots.
  function ownerCountComment(code, remaining = "", total = "", used = "") {
    return feedbackComment(code, "count")
      .replace("[enter actual number or leave blank]", String(remaining).trim())
      .replace("Total invites: [optional]", "Total invites: " + String(total).trim())
      .replace("Used invites: [optional]", "Used invites: " + String(used).trim());
  }

  // Existing GitHub Issues cannot prefill comments through a URL. Instead this
  // browser-only dialog prepares an editable comment, lets the visitor copy it,
  // and opens the ONE linked Issue. Never submit or reopen on mere page clicks.
  let feedbackDialogApi = null;
  function feedbackDialog() {
    if (feedbackDialogApi) return feedbackDialogApi;
    if (typeof document === "undefined" || typeof HTMLDialogElement === "undefined") return null;
    const dialog = document.createElement("dialog");
    dialog.className = "feedback-dialog";
    dialog.setAttribute("aria-labelledby", "feedback-dialog-title");
    dialog.setAttribute("aria-describedby", "feedback-dialog-help");
    const surface = document.createElement("div");
    surface.className = "feedback-dialog-body";
    const heading = document.createElement("h2");
    heading.id = "feedback-dialog-title";
    const help = document.createElement("p");
    help.id = "feedback-dialog-help";
    help.textContent = "Review and copy your prepared comment, then open the existing GitHub Issue and paste it. GitHub cannot prefill comments in an existing Issue.";
    const label = document.createElement("label");
    label.setAttribute("for", "feedback-comment-text");
    label.textContent = "Your comment (editable)";
    const textarea = document.createElement("textarea");
    textarea.id = "feedback-comment-text";
    textarea.rows = 7;
    textarea.maxLength = 3000;
    const countFields = document.createElement("div");
    countFields.className = "feedback-count-fields";
    const remainingLabel = document.createElement("label");
    remainingLabel.setAttribute("for", "feedback-count-remaining");
    remainingLabel.textContent = "Remaining invites";
    const remainingHint = document.createElement("p");
    remainingHint.className = "feedback-count-hint";
    remainingHint.textContent = "How many invites are left in your Muse account? Enter 0 if none.";
    const remainingInput = document.createElement("input");
    remainingInput.id = "feedback-count-remaining";
    remainingInput.type = "text";
    remainingInput.inputMode = "numeric";
    remainingInput.pattern = "[0-9]*";
    remainingInput.maxLength = 4;
    remainingInput.autocomplete = "off";
    remainingInput.placeholder = "e.g. 3";
    remainingInput.setAttribute("aria-describedby", "feedback-count-hint");
    remainingHint.id = "feedback-count-hint";
    const optionalCounts = document.createElement("details");
    optionalCounts.className = "feedback-count-extra";
    const optionalSummary = document.createElement("summary");
    optionalSummary.textContent = "Have total and used counts? (optional)";
    const optionalHelp = document.createElement("p");
    optionalHelp.textContent = "If you do not know the remaining count, enter BOTH total and used.";
    optionalHelp.className = "feedback-count-hint";
    const optionalGrid = document.createElement("div");
    optionalGrid.className = "feedback-count-grid";
    function optionalCountField(id, text, placeholder) {
      const wrapper = document.createElement("div");
      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = text;
      const input = document.createElement("input");
      input.id = id;
      input.type = "text";
      input.inputMode = "numeric";
      input.pattern = "[0-9]*";
      input.maxLength = 4;
      input.autocomplete = "off";
      input.placeholder = placeholder;
      wrapper.append(label, input);
      return { wrapper, input };
    }
    const totalField = optionalCountField("feedback-count-total", "Total invites", "e.g. 30");
    const usedField = optionalCountField("feedback-count-used", "Used invites", "e.g. 27");
    optionalGrid.append(totalField.wrapper, usedField.wrapper);
    optionalCounts.append(optionalSummary, optionalHelp, optionalGrid);
    countFields.append(remainingLabel, remainingHint, remainingInput, optionalCounts);
    countFields.hidden = true;

    const commentEditor = document.createElement("details");
    commentEditor.className = "feedback-comment-editor";
    const commentSummary = document.createElement("summary");
    commentSummary.textContent = "Preview or edit the GitHub comment (optional)";
    commentEditor.append(commentSummary, label, textarea);
    function refreshOwnerComment() {
      if (activeOutcome !== "count") return;
      textarea.value = ownerCountComment(activeCode, remainingInput.value,
        totalField.input.value, usedField.input.value);
      feedbackStatus.textContent = "";
    }
    for (const input of [remainingInput, totalField.input, usedField.input]) {
      input.addEventListener("input", refreshOwnerComment);
    }
    const ownerConfirm = document.createElement("label");
    ownerConfirm.className = "feedback-dialog-consent";
    const ownerCheckbox = document.createElement("input");
    ownerCheckbox.type = "checkbox";
    ownerConfirm.append(ownerCheckbox,
      document.createTextNode(" I confirm these figures come from my own Muse invite screen."));
    ownerConfirm.hidden = true;
    let activeOutcome = "other";
    let activeCode = "";
    const note = document.createElement("p");
    note.className = "feedback-dialog-note";
    note.textContent = "Posting a comment on a closed Issue triggers a review/reopen workflow. A report never verifies Muse redemption automatically.";
    const feedbackStatus = document.createElement("p");
    feedbackStatus.className = "feedback-dialog-status";
    feedbackStatus.setAttribute("role", "status");
    feedbackStatus.setAttribute("aria-live", "polite");
    const controls = document.createElement("div");
    controls.className = "feedback-dialog-actions";
    const copy = document.createElement("button");
    copy.className = "button button-primary";
    copy.type = "button";
    copy.textContent = "Copy comment";
    const open = document.createElement("a");
    open.className = "button button-outlined";
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "Open original Issue";
    const close = document.createElement("button");
    close.className = "button button-outlined";
    close.type = "button";
    close.textContent = "Close";
    controls.append(copy, open, close);
    surface.append(heading, help, countFields, ownerConfirm, commentEditor, note, feedbackStatus, controls);
    dialog.append(surface);
    document.body.append(dialog);
    let trigger = null;

    copy.addEventListener("click", async () => {
      let text = textarea.value.trim();
      if (activeOutcome === "count") {
        const structured = ownerCountComment(activeCode, remainingInput.value,
          totalField.input.value, usedField.input.value);
        const numbers = prepareOwnerCountComment(structured);
        if (numbers.error) {
          feedbackStatus.textContent = numbers.error;
          if (!remainingInput.value.trim() &&
              (!totalField.input.value.trim() || !usedField.input.value.trim())) {
            remainingInput.focus();
          } else {
            optionalCounts.open = true;
            (totalField.input.value.trim() ? usedField.input : totalField.input).focus();
          }
          return;
        }
        if (!ownerCheckbox.checked) {
          feedbackStatus.textContent = "Check the confirmation box before copying your report.";
          ownerCheckbox.focus();
          return;
        }
        // Edited preview is allowed, but must still be a valid owner-count report.
        const prepared = prepareOwnerCountComment(text);
        if (prepared.error) {
          feedbackStatus.textContent = prepared.error;
          commentEditor.open = true;
          textarea.focus();
          return;
        }
        text = prepared.text;
        textarea.value = text;
      }
      if (!text) {
        feedbackStatus.textContent = "Enter a comment before copying.";
        textarea.focus();
        return;
      }
      text = clipboardSafeReport(text);
      textarea.value = text;
      let copied = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch {
        // iOS Safari and embedded browsers can reject the async Clipboard API.
      }
      if (!copied) {
        commentEditor.open = true;
        // Legacy selection-copy works on some Safari versions where writeText fails.
        // Never report success unless the browser confirms the fallback succeeded.
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        try {
          copied = typeof document.execCommand === "function" &&
            document.execCommand("copy") === true;
        } catch {
          copied = false;
        }
      }
      feedbackStatus.textContent = copied ?
        "Copied. Open the linked Issue, paste and submit the comment." :
        "Automatic copy was blocked. Long-press the selected comment and choose Copy, then open the Issue.";
    });
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      if (trigger?.isConnected) trigger.focus();
      trigger = null;
    });
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
    feedbackDialogApi = {
      open(code, outcome, issueNumber, opener) {
        if (!CODE_PATTERN.test(code) || !Object.hasOwn(FEEDBACK_CHOICES, outcome) ||
            !Number.isSafeInteger(issueNumber) || issueNumber <= 0) return false;
        const isCount = outcome === "count";
        heading.textContent = isCount ?
          "Update invites · " + code : "Report code " + code;
        activeOutcome = outcome;
        activeCode = code;
        ownerCheckbox.checked = false;
        ownerConfirm.hidden = !isCount;
        countFields.hidden = !isCount;
        remainingInput.value = "";
        totalField.input.value = "";
        usedField.input.value = "";
        optionalCounts.open = false;
        commentEditor.open = !isCount;
        copy.textContent = isCount ? "Copy report" : "Copy comment";
        label.textContent = isCount ? "Prepared GitHub comment (editable)" : "Your comment (editable)";
        help.textContent = isCount ?
          "Enter the figures you see in Muse. We will prepare the GitHub comment for you." :
          "Review and copy your prepared comment, then open the existing GitHub Issue and paste it. GitHub cannot prefill comments in an existing Issue.";
        note.textContent = isCount ?
          "Copying does not submit your update. After copying, open GitHub, paste and post the comment. Only the listed GitHub owner can request an update." :
          "Posting a comment on a closed Issue triggers a review/reopen workflow. A report never verifies Muse redemption automatically.";
        const date = new Date();
        // Local date is only a convenient editable starting point.
        const localDate = [date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0")].join("-");
        textarea.value = isCount ? ownerCountComment(code) :
          feedbackComment(code, outcome).replace("[add date]", localDate);
        open.href = quickFeedbackUrl(code, outcome, issueNumber);
        open.textContent = "Open Issue #" + issueNumber;
        feedbackStatus.textContent = isCount ? "" :
          "No comment has been submitted. Copy the text before opening GitHub.";
        trigger = opener || document.activeElement;
        if (dialog.open) dialog.close();
        dialog.showModal();
        if (isCount) remainingInput.focus();
        else textarea.focus();
        return true;
      }
    };
    return feedbackDialogApi;
  }
  function openFeedbackDialog(code, outcome, issueNumber, opener) {
    return feedbackDialog()?.open(code, outcome, issueNumber, opener) === true;
  }

  // A single viewport-positioned tooltip avoids clipping inside card/panel overflow
  // and allows mouse, keyboard and touch users to discover the action.
  let tooltipApi = null;
  function enableTooltips() {
    if (tooltipApi) return tooltipApi;
    if (typeof document === "undefined") return null;
    const tip = document.createElement("div");
    tip.id = "muse-action-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    document.body.append(tip);
    let active = null;
    let oldDescription = null;
    let dismissTimer = null;
    let lastPointerWasTouch = false;

    function stopTimer() {
      if (dismissTimer !== null) window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    function hide() {
      stopTimer();
      if (active) {
        if (oldDescription === null) active.removeAttribute("aria-describedby");
        else active.setAttribute("aria-describedby", oldDescription);
      }
      active = null;
      oldDescription = null;
      tip.hidden = true;
    }
    function show(target) {
      if (!target || !target.isConnected || !target.dataset.tooltip) return hide();
      stopTimer();
      if (active !== target) {
        hide();
        active = target;
        oldDescription = target.getAttribute("aria-describedby");
        target.setAttribute("aria-describedby",
          (oldDescription ? oldDescription + " " : "") + tip.id);
      }
      tip.textContent = target.dataset.tooltip;
      tip.hidden = false;
      const rect = target.getBoundingClientRect();
      const bounds = tip.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const left = Math.max(10, Math.min(rect.left + rect.width / 2 - bounds.width / 2,
        viewportWidth - bounds.width - 10));
      let top = rect.top - bounds.height - 10;
      if (top < 8) top = rect.bottom + 10;
      if (top + bounds.height > viewportHeight - 8) {
        top = Math.max(8, rect.top - bounds.height - 10);
      }
      tip.style.left = Math.round(left) + "px";
      tip.style.top = Math.round(top) + "px";
    }
    function getTarget(event) {
      return event.target instanceof Element ? event.target.closest("[data-tooltip]") : null;
    }
    document.addEventListener("pointerover", event => {
      if (event.pointerType !== "touch") {
        lastPointerWasTouch = false;
        const target = getTarget(event);
        if (target) show(target);
      }
    });
    document.addEventListener("pointerout", event => {
      if (event.pointerType !== "touch" && active && !active.contains(event.relatedTarget)) hide();
    });
    document.addEventListener("focusin", event => {
      const target = getTarget(event);
      if (target) {
        show(target);
        if (lastPointerWasTouch) dismissTimer = window.setTimeout(hide, 2400);
      }
    });
    document.addEventListener("focusout", event => {
      if (active === event.target) hide();
    });
    document.addEventListener("pointerdown", event => {
      lastPointerWasTouch = event.pointerType === "touch";
      if (!lastPointerWasTouch) return;
      const target = getTarget(event);
      if (!target) return hide();
      show(target);
      dismissTimer = window.setTimeout(hide, 2400);
    });
    document.addEventListener("click", event => {
      if (getTarget(event)?.tagName === "A") hide();
    });
    document.addEventListener("keydown", event => {
      lastPointerWasTouch = false;
      if (event.key === "Escape") hide();
    });
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("resize", hide, { passive: true });
    tooltipApi = { show, hide, refresh() {
      if (active && active.isConnected) {
        show(active);
        if (lastPointerWasTouch) dismissTimer = window.setTimeout(hide, 2400);
      } else hide();
    } };
    return tooltipApi;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", enableTooltips, { once: true });
    } else {
      enableTooltips();
    }
  }

  return { STORAGE_KEY, COPIED_STORAGE_KEY, MAX_SAVED, tokenPotential, parseSaved, parseCopied,
    rememberCopiedCode, museInviteUrl, activityDate, compareCodes, quickFeedbackUrl,
    feedbackComment, ownerCountComment, prepareOwnerCountComment, clipboardSafeReport, issueNumberFor, openFeedbackDialog, enableTooltips };
});
