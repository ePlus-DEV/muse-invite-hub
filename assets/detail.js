(() => {
  "use strict";
  const button = document.getElementById("detail-copy");
  const code = document.getElementById("detail-code");
  const live = document.getElementById("detail-live");
  if (!button || !code || !live) return;

  const features = window.MuseDirectoryFeatures;
  const detailSave = document.getElementById("detail-save");
  const detailCode = code.textContent.trim();
  // Counts are published human GitHub reports, not votes cast by clicking here.
  // Incomplete or missing snapshots never become a fabricated zero.
  void (async () => {
    if (typeof fetch !== "function") return;
    try {
      const response = await fetch("../../data/feedback-counts.json",{cache:"no-store"});
      if (!response.ok) return;
      const snapshot = await response.json();
      if (snapshot?.source !== "reviewed-github-feedback" ||
          !Number.isFinite(Date.parse(snapshot.generatedAt || ""))) return;
      const counts = snapshot.codes?.[detailCode];
      if (!counts) return;
      for (const link of document.querySelectorAll(".detail-quick-feedback")) {
        const outcome = link.dataset.feedbackOutcome;
        const count = counts[outcome];
        if (!["worked","failed"].includes(outcome) ||
            !Number.isSafeInteger(count) || count < 0) continue;
        const label = document.createElement("span");
        label.className = "detail-feedback-count";
        label.textContent = count > 999 ? "999+" : String(count);
        label.setAttribute("aria-hidden","true");
        link.append(label);
        const context = count + " community " + (count === 1 ? "report" : "reports") +
          " of " + (outcome === "worked" ? "success" : "failure");
        link.setAttribute("aria-label", (outcome === "worked" ? "Worked for me" : "Didn\'t work") + " — " + context);
        link.dataset.tooltip = context + " from the last published GitHub snapshot; not live or Muse-verified.";
      }
    } catch { /* Hide counts when the trusted snapshot is unavailable. */ }
  })();
  // PR previews deliberately use the trusted main HTML generator. Until the
  // generator fix is merged, normalize its legacy detail DOM on the client.
  // This also handles browser-cached detail HTML without running untrusted
  // pull-request scripts in the privileged Pages build.
  function normalizeLegacyDetail() {
    for (const selector of [
      '.detail-action-row a[href="https://muse.ai/join"]',
      ".detail-lead", ".detail-caution", ".detail-code-heading .detail-owner",
      ".detail-info-card .detail-caption"
    ]) {
      document.querySelector(selector)?.remove?.();
    }
    const kicker = document.querySelector(".detail-primary > .section-kicker");
    if (kicker?.textContent?.includes("MUSE INVITE ·")) kicker.textContent = "MUSE INVITE";
    const status = document.querySelector(".detail-status");
    if (status?.textContent?.includes("Verified Owner")) {
      status.title = "Ownership confirmed by ePlus.DEV; Muse redemption is not verified.";
    }
    const note = document.querySelector(".detail-note");
    if (note && /owner.confirmed/i.test(note.textContent || "") &&
        /redeem|availability|independently/i.test(note.textContent || "")) {
      note.remove?.();
    }
    const metadata = document.querySelector(".detail-meta");
    for (const row of metadata?.querySelectorAll?.("div") || []) {
      if (row.querySelector?.("dt")?.textContent?.trim() === "Code owner") row.remove?.();
    }
    const instructions = document.querySelector(".detail-instructions");
    const steps = [...(instructions?.querySelector?.("ol")?.querySelectorAll?.("li") || [])];
    if (steps.length >= 3) {
      steps[0].textContent = "Select Open invite above to visit Muse with this code.";
      steps[1].textContent = "Follow Muse's instructions and check eligibility before redeeming.";
      for (const item of steps.slice(2)) item.remove?.();
    }
    instructions?.querySelector?.("p")?.remove?.();
  }
  normalizeLegacyDetail();
  // Privileged PR previews generate their HTML using trusted main: put the
  // existing Save control in the header and make Open invite the first CTA in
  // keyboard as well as visual order. The production generator already does so.
  const cardHeading = document.querySelector(".detail-code-heading");
  if (cardHeading && detailSave && detailSave.parentElement !== cardHeading &&
      typeof cardHeading.append === "function") cardHeading.append(detailSave);
  const inviteActions = document.querySelector(".detail-action-row");
  const openInvite = inviteActions?.querySelector?.('a[href^="https://muse.ai/invite/"]');
  if (openInvite && typeof inviteActions.insertBefore === "function" &&
      openInvite.nextElementSibling !== button) {
    inviteActions.insertBefore(openInvite,button);
  }
  // Trusted Pages previews use the main HTML generator. Recompose its existing
  // real content to match the reviewed mockup; do not inject untrusted HTML.
  const hero = document.querySelector(".detail-code-panel");
  const detailLayout = document.querySelector(".detail-layout");
  const detailPrimary = document.querySelector(".detail-primary");
  const title = document.getElementById("detail-title");
  const guidance = document.querySelector(".detail-instructions");
  const legacyReport = document.querySelector(".detail-side > .detail-info-card:first-child");
  const make = (tag,cls,text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const makeStat = (iconClass,value,valueClass,caption) => {
    const stat = make("div","detail-stat");
    const icon = make("i",iconClass);
    icon.setAttribute("aria-hidden","true");
    const body = make("span","detail-stat-body");
    if (typeof value === "string") body.append(make("strong",valueClass,value));
    else body.append(value);
    body.append(make("span",valueClass==="detail-slots-number" ?
      "detail-slots-caption" : "detail-stat-label",caption));
    stat.append(icon,body);
    return stat;
  };
  if (hero && title && detailLayout && detailPrimary) {
    hero.classList.add("detail-hero-unified");
    let intro = document.querySelector(".detail-page-intro");
    if (!intro) {
      intro = make("header","detail-page-intro");
      detailLayout.before(intro);
      intro.append(title,make("p","",
        "A community-shared Muse invite code. Check reported availability and share your experience below."));
    }
    const titleCode = title.querySelector(".detail-code-text,.detail-title-code");
    if (titleCode) {
      titleCode.className = "detail-title-code";
      titleCode.removeAttribute?.("id");
    }
    if (title.parentElement !== intro) intro.prepend(title);
    document.querySelector(".detail-primary > .section-kicker")?.remove?.();
    const codeDisplay = hero.querySelector(".detail-code-display") || make("div","detail-code-display");
    let visibleCode = hero.querySelector("#detail-code");
    if (!visibleCode) {
      visibleCode = make("p","detail-code-text",detailCode);
      visibleCode.id = "detail-code";
    }
    visibleCode.className = "detail-code-text";
    if (!hero.querySelector(".detail-code-display")) {
      cardHeading?.after(codeDisplay);
      codeDisplay.append(visibleCode);
    }
    if (!codeDisplay.querySelector(".detail-copy-inline")) {
      const quickCopy = make("button","detail-copy-inline");
      quickCopy.type = "button";
      quickCopy.setAttribute("aria-label","Copy invite code "+detailCode);
      quickCopy.title = "Copy invite code";
      const icon = make("i","fa-regular fa-copy");
      icon.setAttribute("aria-hidden","true");
      quickCopy.append(icon);
      quickCopy.addEventListener("click",()=>button.click());
      codeDisplay.append(quickCopy);
    }
    if (!hero.querySelector(".detail-stats")) {
      const stats = make("div","detail-stats");
      stats.setAttribute("aria-label","Community-reported invitation statistics");
      const value = legacyReport?.querySelector?.(".detail-slots-number");
      const rawCaption = legacyReport?.querySelector?.(".detail-slots-caption")?.textContent || "";
      const reportDate = rawCaption.match(/reported\s+(.+?)\s*[·•]\s*Not live/i)?.[1]?.trim() || "No report";
      const reported = value?.textContent?.trim() || "Not reported";
      stats.append(
        makeStat("fa-solid fa-users",reported,"detail-slots-number",
          reported === "Not reported" ? "No confirmed data" : "Invites remaining · Not live"),
        makeStat("fa-regular fa-calendar",reportDate,"detail-stat-date","Last reported"),
        makeStat("fa-solid fa-arrows-rotate","—","detail-stat-updates","No recorded updates")
      );
      inviteActions?.after(stats);
      legacyReport?.remove?.();
      // The published sidecar holds reviewed pre-tracking revisions. A missing
      // sidecar is unknown history, not a fabricated count of zero.
      const updateStat = stats.querySelector(".detail-stat-updates");
      const updateCaption = updateStat?.nextElementSibling;
      void (async () => {
        if (typeof fetch !== "function" || !updateStat) return;
        let baseline=0,tracked=0;
        for (const url of ["../../data/quota-update-baseline.json",
          "/data/quota-update-baseline.json"]) {
          try {
            const response=await fetch(url,{cache:"no-store"});
            if (!response.ok) continue;
            const data=await response.json();
            if (Number.isSafeInteger(data?.[detailCode]) && data[detailCode] > 0) {
              baseline=data[detailCode];
            }
            break;
          } catch { /* A preview may omit the optional sidecar. */ }
        }
        try {
          const response=await fetch("../../data/invites.json",{cache:"no-store"});
          if (response.ok) {
            const items=await response.json();
            const item=Array.isArray(items) ?
              items.find(entry=>entry?.code===detailCode) : null;
            if (Number.isSafeInteger(item?.quotaUpdateCount) &&
                item.quotaUpdateCount>0) tracked=item.quotaUpdateCount;
          }
        } catch { /* Keep the reviewed baseline, if known. */ }
        const count=baseline+tracked;
        if (count>0) {
          updateStat.textContent=count+(count===1?" update":" updates");
          if (updateCaption) updateCaption.textContent="Quota updated";
        }
      })();
    }
    const parentStats = hero.querySelector(".detail-stats");
    const oldIdentity = hero.querySelector(".detail-identity-row");
    if (oldIdentity) {
      // Earlier previews place the title and reported quota in this row.
      oldIdentity.remove?.();
    }
    if (parentStats && parentStats.parentElement !== hero) hero.append(parentStats);
    const contributorNote = document.querySelector(".detail-primary > .detail-note");
    if (contributorNote && contributorNote.parentElement !== hero) {
      hero.append(contributorNote);
    }
    const moveIntoFold = (original,headingText,iconClass,kind) => {
      if (!original || original.tagName === "DETAILS") return original;
      const fold=make("details",original.className+" detail-mobile-fold");
      if (kind) fold.classList.add(kind);
      fold.open=true;
      const summary=make("summary");
      const mark=make("i",iconClass);mark.setAttribute("aria-hidden","true");
      const caret=make("i","fa-solid fa-chevron-down detail-fold-chevron");
      caret.setAttribute("aria-hidden","true");
      const body=make("div","detail-fold-body");
      for (const element of [...original.children]) {
        if (element.matches?.("h2,.section-kicker")) continue;
        body.append(element);
      }
      const titleText=make("h2","",headingText);
      if (kind === "detail-instructions") titleText.id = "how-to-redeem";
      summary.append(mark,titleText,caret);
      fold.append(summary,body);
      original.replaceWith(fold);
      return fold;
    };
    moveIntoFold(guidance,"How to use this code",
      "fa-solid fa-book-open","detail-instructions");
    const listing=document.querySelector(".detail-side > .detail-info-card:first-child");
    if (listing && listing.querySelector(".detail-meta")) {
      moveIntoFold(listing,"Code details",
        "fa-solid fa-circle-info","detail-listing");
    }
    const market=document.querySelector(".detail-market-section");
    if (market && market.parentElement !== detailLayout) detailLayout.append(market);
  }
  // Mobile accordions start compact; desktop content is always expanded.
  const foldMedia=typeof window.matchMedia==="function" ?
    window.matchMedia("(max-width:620px)") : null;
  const syncFolds=()=>{
    for (const fold of document.querySelectorAll(".detail-mobile-fold")) {
      fold.open=!foldMedia?.matches;
    }
  };
  if (foldMedia) {
    syncFolds();
    foldMedia.addEventListener?.("change",syncFolds);
  }
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
    function connectFeedbackThread() {
      const feedbackLink = document.querySelector(".detail-feedback > a");
      const countLink = document.querySelector(".detail-owner-count");
      const quickLinks = [...document.querySelectorAll(".detail-quick-feedback")];
      // The static detail generator already contains this code's canonical Issue
      // URL. Never delay click handlers while fetching supplemental JSON.
      const staticHref = feedbackLink?.href || countLink?.href || quickLinks[0]?.href || "";
      const staticMatch = /^https:\/\/github\.com\/ePlus-DEV\/muse-invite-hub\/issues\/([1-9][0-9]*)(?:#.*)?$/
        .exec(staticHref);
      let issueNumber = staticMatch ? Number(staticMatch[1]) : null;

      const actions = [
        ...(feedbackLink ? [{link:feedbackLink,outcome:"other"}] : []),
        ...(countLink ? [{link:countLink,outcome:"count"}] : []),
        ...quickLinks.map(link => ({link,outcome:link.dataset.feedbackOutcome}))
      ];
      const descriptions = {
        other:"Review and copy feedback for this code's original GitHub Issue.",
        count:"Update your own Muse invite quota using the same editable report dialog as the directory.",
        worked:"Review and copy a success report for the original Issue.",
        failed:"Review and copy a failure report for the original Issue."
      };
      function refreshLinks() {
        for (const {link,outcome} of actions) {
          link.href = features.quickFeedbackUrl(detailCode, outcome, issueNumber);
          link.dataset.tooltip = descriptions[outcome] || descriptions.other;
        }
      }
      // Listeners attach immediately, even offline, on slow networks, or in PR previews.
      for (const {link,outcome} of actions) {
        link.addEventListener("click", event => {
          if (features.openFeedbackDialog(detailCode, outcome, issueNumber, link)) {
            event.preventDefault();
          }
        });
      }
      refreshLinks();

      // Supplemental code→Issue JSON can correct an old HTML link but must
      // never create a new Issue, switch codes or silently submit reports.
      void (async () => {
        try {
          const response = await fetch("../../data/code-issues.json", {cache:"no-store"});
          if (!response.ok) return;
          const map = await response.json();
          const resolved = features.issueNumberFor(map, detailCode);
          if (resolved && resolved !== issueNumber) {
            issueNumber = resolved;
            refreshLinks();
          }
        } catch { /* Retain the static canonical Issue URL when offline. */ }
      })();
    }
    connectFeedbackThread();
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
      if (url.protocol !== "https:" || url.username || url.password) return;
      const host = url.hostname.toLowerCase(), path = url.pathname;
      const facebookHost = ["facebook.com","www.facebook.com","m.facebook.com","mbasic.facebook.com","web.facebook.com","fb.com","www.fb.com","fb.watch"].includes(host);
      if (!facebookHost && (url.search || url.hash)) return;
      let match, platform, group = false;
      if (["threads.com","www.threads.com"].includes(host)) {
        match = /^\/@([A-Za-z0-9_.]{1,30})(?:\/post\/[A-Za-z0-9_-]+)?\/?$/.exec(path);
        platform = "Threads";
      } else if (["x.com","www.x.com","twitter.com","www.twitter.com"].includes(host)) {
        match = /^\/([A-Za-z0-9_]{1,15})(?:\/status\/[0-9]{5,25})?\/?$/.exec(path);
        if (match && ["i","home","search","explore","intent","share","settings","messages"].includes(match[1].toLowerCase())) return;
        platform = "X (Twitter)";
      } else if (["t.me","www.t.me"].includes(host)) {
        match = /^\/([A-Za-z][A-Za-z0-9_]{4,31})(?:\/[1-9][0-9]{0,18})?\/?$/.exec(path);
        if (match && ["share","joinchat","login","addstickers","proxy","socks","addemoji"].includes(match[1].toLowerCase())) return;
        platform = "Telegram";
      } else if (facebookHost) {
        if (url.username || url.password || url.port || /^(?:\/(?:l\.php|flx\/warn|login(?:\.php)?|checkpoint)(?:\/|$))/i.test(path) || [...url.searchParams.keys()].some(key => /^(?:access_token|token|auth|auth_token|session|session_id|password|code|signed_request)$/i.test(key))) return;
        match = /^\/groups\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})(?:\/(?:posts|permalink)\/[^/]+)?\/?$/.exec(path);
        group = Boolean(match);
        if (!group) {
          match = /^\/([A-Za-z0-9.]{2,50})\/posts\/[A-Za-z0-9_-]{4,120}\/?$/.exec(path);
          if (!["facebook.com","www.facebook.com","m.facebook.com"].includes(host) || url.search || url.hash ||
              (match && ["share","groups","watch","reel","reels","events","marketplace","people","pages","profile.php","permalink.php","photo.php","story.php","login"].includes(match[1].toLowerCase()))) match = null;
        }
        platform = "Facebook";
      }
      if (!match && !facebookHost) return;
      const handle = match ? (group ? "Group: " : "@") + match[1] : "Source reference";
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
  const copyPanel = document.querySelector(".detail-code-panel");
  const copyActions = document.querySelector(".detail-action-row");
  let copiedNote = null;
  if (copyPanel && copyActions && typeof document.createElement === "function") {
    copiedNote = document.createElement("p");
    copiedNote.className = "detail-copy-note";
    copiedNote.textContent = "Copied on this device";
    copiedNote.hidden = true;
    copyActions.after(copiedNote);
  }
  let copyFeedbackTimer = null;
  let copiedBefore = false;
  function setCopiedAppearance(value) {
    copiedBefore = value;
    copyPanel?.classList.toggle("detail-code-panel-copied", value);
    button.dataset.copied = String(value);
    button.dataset.tooltip = value ?
      "Previously copied in this browser. Copying does not redeem it on Muse." :
      "Copy this code. Copying does not redeem it in Muse.";
    button.setAttribute?.("aria-label",
      (value ? "Copy again Muse invite code " : "Copy Muse invite code ") + detailCode);
    if (copiedNote) copiedNote.hidden = !value;
    if (copyFeedbackTimer === null) {
      setLabel(value ? "Copy again" : "Copy invite code",
        value ? "fa-solid fa-rotate" : "fa-regular fa-copy");
    }
  }
  function previouslyCopied() {
    try {
      return features?.parseCopied(window.localStorage.getItem(features.COPIED_STORAGE_KEY))
        .includes(detailCode) || false;
    } catch {
      return false;
    }
  }
  setCopiedAppearance(previouslyCopied());
  if (typeof window.addEventListener === "function") {
    window.addEventListener("storage", event => {
      if (event.key !== features?.COPIED_STORAGE_KEY && event.key !== null) return;
      setCopiedAppearance(features.parseCopied(event.key === null ? null : event.newValue)
        .includes(detailCode));
    });
  }
  function restoreCopyLabel() {
    if (copyFeedbackTimer !== null && typeof window.clearTimeout === "function") {
      window.clearTimeout(copyFeedbackTimer);
    }
    copyFeedbackTimer = window.setTimeout(() => {
      copyFeedbackTimer = null;
      setCopiedAppearance(copiedBefore);
    }, 2400);
  }
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
      try {
        features?.rememberCopiedCode(window.localStorage, value);
      } catch { /* Storage may be disabled; keep the visual copy state in this tab. */ }
      setCopiedAppearance(true);
      setLabel("Copied!", "fa-solid fa-check");
      live.textContent = "Copied invitation code " + value + " on this device. This does not confirm Muse redemption.";
      restoreCopyLabel();
    } catch {
      setLabel("Copy failed", "fa-solid fa-xmark");
      live.textContent = "Select and copy the code manually.";
      restoreCopyLabel();
    }
  });
})();
