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

  function quickFeedbackUrl(code, outcome) {
    if (!CODE_PATTERN.test(code)) throw Error("Invalid public invite code");
    const choices = {
      worked: "Worked for me",
      failed: "Didn't work for me"
    };
    if (!Object.hasOwn(choices, outcome)) throw Error("Invalid feedback option");
    const details = "Quick feedback choice: " + choices[outcome] +
      ". Please confirm your experience and select the required Listing platform and " +
      "What happened? options before submitting. Only Muse can verify redemption.";
    const params = new URLSearchParams({
      template: "report-code.yml",
      invite_code: code,
      title: "[Code feedback] " + code,
      details
    });
    // GitHub Issue Forms dropdowns cannot be preselected by query parameters.
    return REPO + "/issues/new?" + params.toString();
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
    quickFeedbackUrl, enableTooltips };
});
