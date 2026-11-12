(() => {
  "use strict";
  const button = document.getElementById("detail-copy");
  const code = document.getElementById("detail-code");
  const live = document.getElementById("detail-live");
  if (!button || !code || !live) return;

  const features = window.MuseDirectoryFeatures;
  const detailSave = document.getElementById("detail-save");
  const detailCode = code.textContent.trim();
  // The trusted PR preview renderer can still use old main HTML. Align DOM focus
  // order with the new visual order: redemption choices before secondary actions.
  const feedbackCard = document.querySelector(".detail-feedback");
  const outcomeControls = feedbackCard?.querySelector(".detail-feedback-actions");
  const firstSecondary = feedbackCard?.querySelector(":scope > a");
  if (feedbackCard && outcomeControls && firstSecondary) {
    feedbackCard.insertBefore(outcomeControls, firstSecondary);
  }
  if (features && detailSave) {
    function readSavedCodes() {
      try {
        return new Set(features.parseSaved(window.localStorage.getItem(features.STORAGE_KEY)));
      } catch {
        return new Set();
      }
    }
    let savedCodes = readSavedCodes();
    const saveLabel = detailSave.querySelector(".detail-save-label");
    const saveIcon = detailSave.querySelector("i");
    function refreshSavedButton() {
      const active = savedCodes.has(detailCode);
      detailSave.setAttribute("aria-pressed", String(active));
      detailSave.setAttribute("aria-label",
        (active ? "Remove saved Muse invite code " : "Save Muse invite code ") + detailCode);
      if (saveLabel) saveLabel.textContent = active ? "Saved" : "Save code";
      detailSave.dataset.tooltip = active ?
        "Remove this bookmark from this browser." :
        "Save this code on this device. No login or cloud sync.";
      features.enableTooltips()?.refresh();
      if (saveIcon) saveIcon.className = active ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
    }
    detailSave.hidden = false;
    refreshSavedButton();
    detailSave.addEventListener("click", () => {
      if (savedCodes.has(detailCode)) savedCodes.delete(detailCode);
      else if (savedCodes.size < features.MAX_SAVED) savedCodes.add(detailCode);
      else {
        live.textContent = "Saved code limit reached.";
        return;
      }
      let persisted = true;
      try {
        window.localStorage.setItem(features.STORAGE_KEY, JSON.stringify([...savedCodes]));
      } catch {
        persisted = false;
      }
      refreshSavedButton();
      live.textContent = detailCode + (savedCodes.has(detailCode) ?
        " saved on this device." : " removed from saved codes.") +
        (persisted ? "" : " Storage is unavailable; changes last only for this tab.");
    });
    window.addEventListener("storage", event => {
      if (event.key !== features.STORAGE_KEY && event.key !== null) return;
      savedCodes = new Set(features.parseSaved(event.key === null ? null : event.newValue));
      refreshSavedButton();
    });
  }
  if (features) {
    // The trusted Pages deployment publishes one Issue number for every code.
    // A missing map never creates duplicate feedback Issues.
    async function connectFeedbackThread() {
      const feedbackLink = document.querySelector(".detail-feedback > a");
      const quickLinks = [...document.querySelectorAll(".detail-quick-feedback")];
      let map = {};
      try {
        const response = await fetch("../../data/code-issues.json", { cache: "no-store" });
        if (response.ok) map = await response.json();
      } catch { /* Keep a safe repository Issue-list fallback. */ }
      // Trusted static detail markup already links to the catalog's Issue ID;
      // use it when the supplemental JSON mapping cannot be fetched.
      const staticLink = /^https:\/\/github\.com\/ePlus-DEV\/muse-invite-hub\/issues\/([1-9][0-9]*)(?:#.*)?$/
        .exec(feedbackLink?.href || "");
      const staticNumber = staticLink ? Number(staticLink[1]) : null;
      const number = features.issueNumberFor(map, detailCode) ??
        (Number.isSafeInteger(staticNumber) ? staticNumber : null);
      const url = features.quickFeedbackUrl(detailCode, "other", number);
      if (feedbackLink) {
        feedbackLink.href = url;
        feedbackLink.dataset.tooltip =
          "Prepare an editable comment for this code's existing Issue.";
        feedbackLink.addEventListener("click", event => {
          if (features.openFeedbackDialog(detailCode, "other", number, feedbackLink)) {
            event.preventDefault();
          }
        });
      }
      for (const link of quickLinks) {
        const outcome = link.dataset.feedbackOutcome;
        link.href = features.quickFeedbackUrl(detailCode, outcome, number);
        link.dataset.tooltip = outcome === "worked" ?
          "Review and copy a prepared success report for the original Issue." :
          "Review and copy a prepared failure report for the original Issue.";
        link.addEventListener("click", event => {
          if (features.openFeedbackDialog(detailCode, outcome, number, link)) {
            event.preventDefault();
          }
        });
      }
    }
    void connectFeedbackThread();
  }

  // Hosted PR previews can use a trusted renderer from main. The catalog
  // remains untrusted data: inspect a strict public URL, never inject its HTML.
  async function showSocialProvenance() {
    try {
      const response = await fetch("../../data/invites.json", { cache: "no-store" });
      if (!response.ok) return;
      const entries = await response.json();
      if (!Array.isArray(entries)) return;
      const entry = entries.find(item => item?.code === code.textContent.trim());
      if (!entry || typeof entry.sourceUrl !== "string") return;
      const url = new URL(entry.sourceUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return;
      const host = url.hostname.toLowerCase(), path = url.pathname;
      let match, platform;
      if (["threads.com","www.threads.com"].includes(host)) {
        match = /^\/@([A-Za-z0-9_.]{1,30})(?:\/post\/[A-Za-z0-9_-]+)?\/?$/.exec(path);
        platform = "Threads";
      } else if (["x.com","www.x.com","twitter.com","www.twitter.com"].includes(host)) {
        match = /^\/([A-Za-z0-9_]{1,15})(?:\/status\/[0-9]{5,25})?\/?$/.exec(path);
        if (match && ["i","home","search","explore","intent","share","settings","messages"].includes(match[1].toLowerCase())) return;
        platform = "X (Twitter)";
      } else if (["facebook.com","www.facebook.com","m.facebook.com"].includes(host)) {
        match = /^\/([A-Za-z0-9.]{2,50})(?:\/posts\/[A-Za-z0-9_-]{4,120})?\/?$/.exec(path);
        if (match && ["share","groups","watch","reel","reels","events","marketplace","people","pages","profile.php","permalink.php","photo.php","login"].includes(match[1].toLowerCase())) return;
        platform = "Facebook";
      }
      if (!match) return;
      const handle = "@" + match[1];
      const owner = document.querySelector(".detail-owner");
      if (owner) owner.textContent = handle;
      const meta = document.querySelector(".detail-meta");
      if (!meta) return;
      const rows = [...meta.querySelectorAll("div")];
      const contributor = rows.find(row => row.querySelector("dt")?.textContent === "Contributor");
      if (contributor?.querySelector("dd")) contributor.querySelector("dd").textContent = handle;
      let source = rows.find(row => row.querySelector("dt")?.textContent === "Source");
      if (!source) {
        source = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = "Source";
        source.append(dt, document.createElement("dd"));
        contributor?.after(source);
        if (!contributor) meta.prepend(source);
      }
      const link = document.createElement("a");
      link.textContent = platform + " · " + handle;
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      source.querySelector("dd")?.replaceChildren(link);
    } catch { /* Keep server-rendered metadata if the catalog is unavailable. */ }
  }
  void showSocialProvenance();
  button.dataset.tooltip = "Copy this code. Copying does not redeem it in Muse.";
  const genericFeedback = document.querySelector(".detail-feedback > a");
  if (genericFeedback) genericFeedback.dataset.tooltip =
    "Comment on the existing code Issue; new feedback reopens it for review.";
  const label = button.querySelector(".detail-copy-label");
  const icon = button.querySelector("i");
  const setLabel = (text, iconClass) => {
    if (label) label.textContent = text;
    else button.textContent = text;
    if (icon && iconClass) icon.className = iconClass;
  };
  button.addEventListener("click", async () => {
    const value = code.textContent.trim();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement("textarea");
        input.value = value;
        input.readOnly = true;
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw Error("Unable to copy");
      }
      setLabel("Copied!", "fa-solid fa-check");
      live.textContent = "Copied invitation code " + value + ". Open Muse to try redeeming it.";
      window.setTimeout(() => { setLabel("Copy invite code", "fa-regular fa-copy"); }, 2400);
    } catch {
      setLabel("Copy failed", "fa-solid fa-xmark");
      live.textContent = "Select and copy the code manually.";
      window.setTimeout(() => { setLabel("Copy invite code", "fa-regular fa-copy"); }, 2400);
    }
  });
})();
