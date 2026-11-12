/* Browser-only directory helpers. No server account or Muse API access. */
(function (root, factory) {
  "use strict";
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  if (root) root.MuseDirectoryFeatures = helpers;
})(typeof window === "object" ? window : null, function () {
  "use strict";
  const STORAGE_KEY = "muse-invite-hub:saved-codes:v1";
  const REPO = "https://github.com/ePlus-DEV/muse-invite-hub";
  const CODE_PATTERN = /^[A-Z0-9-]{4,32}$/;
  const MAX_SAVED = 200;

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
      return "Code: " + code + "\nUpdate type: Owner count" +
        "\nRemaining invites: [enter actual number or leave blank]" +
        "\nTotal invites: [optional]" +
        "\nUsed invites: [optional]" +
        "\nOwner confirmation: [confirm this report below]";
    }
    return "Code: " + code + "\nResult: " + FEEDBACK_CHOICES[outcome] +
      "\nWhen I tried: [add date]\nDetails: [add non-sensitive context]";
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
    const ownerConfirm = document.createElement("label");
    ownerConfirm.className = "feedback-dialog-consent";
    const ownerCheckbox = document.createElement("input");
    ownerCheckbox.type = "checkbox";
    ownerConfirm.append(ownerCheckbox,
      document.createTextNode(" I confirm these figures come from my own Muse invite screen."));
    ownerConfirm.hidden = true;
    let activeOutcome = "other";
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
    surface.append(heading, help, label, textarea, ownerConfirm, note, feedbackStatus, controls);
    dialog.append(surface);
    document.body.append(dialog);
    let trigger = null;

    copy.addEventListener("click", async () => {
      let text = textarea.value.trim();
      if (activeOutcome === "count") {
        if (!ownerCheckbox.checked) {
          feedbackStatus.textContent = "Confirm that these numbers came from your own Muse account.";
          ownerCheckbox.focus();
          return;
        }
        const countFields = {};
        for (const line of text.split(/\r?\n/)) {
          const hit = /^(Remaining invites|Total invites|Used invites):\s*(.*)$/.exec(line.trim());
          if (hit) countFields[hit[1]] = hit[2].trim();
        }
        const values = Object.values(countFields);
        const numbers = values.filter(value => /^\d{1,4}$/.test(value));
        if (!numbers.length || values.some(value =>
          value && !/^\d{1,4}$/.test(value) && !/^\[(?:optional|enter actual number or leave blank)\]$/.test(value))) {
          feedbackStatus.textContent = "Enter a real remaining count, or a consistent total and used count.";
          textarea.focus();
          return;
        }
        text = text.replace(/\[enter actual number or leave blank\]|\[optional\]/g,"").replace(
          /Owner confirmation:.*$/m,
          "Owner confirmation: I confirm these figures came from my own Muse invite screen.");
        textarea.value = text;
      }
      if (!text) {
        feedbackStatus.textContent = "Enter a comment before copying.";
        textarea.focus();
        return;
      }
      try {
        if (!navigator.clipboard || !window.isSecureContext) throw Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(text);
        feedbackStatus.textContent = "Copied. Open the linked Issue, paste and submit the comment.";
      } catch {
        textarea.focus();
        textarea.select();
        feedbackStatus.textContent = "Clipboard access was blocked. Copy the selected text manually, then open the Issue.";
      }
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
        heading.textContent = outcome === "count" ?
          "Update owner count for " + code : "Report code " + code;
        activeOutcome = outcome;
        ownerCheckbox.checked = false;
        ownerConfirm.hidden = outcome !== "count";
        help.textContent = outcome === "count" ?
          "Only the listed GitHub owner can propose a count update. Enter numbers shown in your own Muse account, confirm ownership, then copy and comment on the ORIGINAL Issue. GitHub identity is checked before any Draft PR." :
          "Review and copy your prepared comment, then open the existing GitHub Issue and paste it. GitHub cannot prefill comments in an existing Issue.";
        const date = new Date();
        // Local date is only a convenient editable starting point.
        const localDate = [date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0")].join("-");
        textarea.value = feedbackComment(code, outcome).replace("[add date]", localDate);
        open.href = quickFeedbackUrl(code, outcome, issueNumber);
        open.textContent = "Open Issue #" + issueNumber;
        feedbackStatus.textContent = "No comment has been submitted. Copy the text before opening GitHub.";
        trigger = opener || document.activeElement;
        if (dialog.open) dialog.close();
        dialog.showModal();
        textarea.focus();
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

  return { STORAGE_KEY, MAX_SAVED, parseSaved, activityDate, compareCodes,
    quickFeedbackUrl, feedbackComment, issueNumberFor, openFeedbackDialog, enableTooltips };
});
