(() => {
  "use strict";
  const features = window.MuseDirectoryFeatures;
  if (!features) throw Error("Missing directory helpers");
  // Must match MAX_INVITES_PER_CODE in scripts/invite-quota-policy.mjs.
  const MAX_INVITES_PER_CODE = 30;
  const STATUS = {
    "reported-working": { label: "Reported working", description: "A community member reported this code worked; not verified by Muse." },
    "unverified": { label: "Unverified", description: "Shared by the community; no confirmed redemption feedback." },
    "reported-not-working": { label: "Reported not working", description: "A community member reported a redemption problem." }
  };
  const grid = document.getElementById("code-grid");
  const searchInput = document.getElementById("code-search");
  const sortTrigger = document.getElementById("sort-trigger");
  const sortMenu = document.getElementById("sort-menu");
  const sortCurrent = document.getElementById("sort-current");
  const sortOptions = [...sortMenu.querySelectorAll(".sort-option")];
  let sortValue = "newest";
  const sourceFilters = [...document.querySelectorAll(".source-filter, .saved-filter")];
  const savedFilter = document.getElementById("saved-filter");
  const savedCount = document.getElementById("saved-count");
  let sourceFilter = "all";
  const resultCount = document.getElementById("result-count");
  const more = document.getElementById("directory-more");
  const moreButton = document.getElementById("load-more-codes");
  const empty = document.getElementById("empty-state");
  const announcer = document.getElementById("live-message");
  const PAGE_SIZE = 12;
  let displayLimit = PAGE_SIZE;
  let codes = [];
  let loadFailed = false;
  let codeIssueMap = {};
  let feedbackCounts = null;
  let quotaUpdateBaselines = {};
  function feedbackIssue(code, outcome = "other") {
    const item = codes.find(entry => entry.code === code);
    const number = features.issueNumberFor(codeIssueMap, code) ??
      (Number.isSafeInteger(item?.feedbackIssueNumber) ? item.feedbackIssueNumber : null);
    return features.quickFeedbackUrl(code, outcome, number);
  }
  function prepareFeedback(event, item, outcome) {
    const number = features.issueNumberFor(codeIssueMap, item.code) ??
      (Number.isSafeInteger(item.feedbackIssueNumber) ? item.feedbackIssueNumber : null);
    if (features.openFeedbackDialog(item.code, outcome, number, event.currentTarget)) {
      event.preventDefault(); // Keep plain GitHub links as no-JS fallbacks.
    }
  }
  function readSavedCodes() {
    try {
      return new Set(features.parseSaved(window.localStorage.getItem(features.STORAGE_KEY)));
    } catch {
      // Private browsing and blocked storage should not break the directory.
      return new Set();
    }
  }
  let savedCodes = readSavedCodes();

  function readCopiedCodes() {
    try {
      return new Set(features.parseCopied(window.localStorage.getItem(features.COPIED_STORAGE_KEY)));
    } catch {
      return new Set();
    }
  }
  let copiedCodes = readCopiedCodes();

  function updateCopiedCard(card) {
    const code = card.dataset.code;
    const copied = copiedCodes.has(code);
    card.classList.toggle("code-card-copied", copied);
    const button = card.querySelector(".card-copy");
    if (!button) return;
    button.dataset.copied = String(copied);
    button.dataset.tooltip = copied
      ? "Copied on this device. Click to copy again; this does not confirm Muse redemption."
      : "Copy this code. Copying does not redeem it in Muse.";
    button.setAttribute("aria-label",
      (copied ? "Copy again Muse invite code " : "Copy Muse invite code ") + code);
    const label = copied ? " Copied" : " Copy code";
    button.replaceChildren(icon(copied ? "fa-solid fa-check" : "fa-regular fa-copy"),
      document.createTextNode(label));
  }
  function syncCopiedCards() {
    grid.querySelectorAll(".code-card").forEach(updateCopiedCard);
  }

  function updateSaveButton(button) {
    const code = button.dataset.code;
    const saved = savedCodes.has(code);
    button.setAttribute("aria-pressed", String(saved));
    button.setAttribute("aria-label",
      (saved ? "Remove saved Muse invite code " : "Save Muse invite code ") + code);
    button.dataset.tooltip = saved ?
      "Remove this bookmark from this browser." :
      "Save this code on this device. No login or cloud sync.";
    features.enableTooltips()?.refresh();
    button.replaceChildren(icon(saved ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark"));
  }
  function syncSavedUi() {
    savedCount.textContent = String(codes.filter(item => savedCodes.has(item.code)).length);
    grid.querySelectorAll(".card-save").forEach(updateSaveButton);
  }
  function toggleSaved(code) {
    if (savedCodes.has(code)) savedCodes.delete(code);
    else if (savedCodes.size < features.MAX_SAVED) savedCodes.add(code);
    else {
      announcer.textContent = "Saved code limit reached.";
      return;
    }
    let persisted = true;
    try {
      window.localStorage.setItem(features.STORAGE_KEY, JSON.stringify([...savedCodes]));
    } catch {
      persisted = false;
    }
    syncSavedUi();
    if (sourceFilter === "saved") {
      render(true);
      savedFilter.focus();
    }
    announcer.textContent = code + (savedCodes.has(code) ?
      " saved on this device." : " removed from saved codes.") +
      (persisted ? "" : " Storage is unavailable; changes last only for this tab.");
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(className) {
    const node = el("i", className);
    node.setAttribute("aria-hidden", "true");
    return node;
  }
  function formatDate(date) {
    if (!date) return "Date unknown";
    const parsed = new Date(date + "T00:00:00Z");
    if (Number.isNaN(parsed.getTime())) return "Date unknown";
    return parsed.toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric", timeZone: "UTC"
    });
  }
  function reportedRemaining(item) {
    if (!item) return null;
    const projection=item.quotaDisplay;
    if (projection && Number.isSafeInteger(projection.capacity) &&
        projection.capacity>=1 && projection.capacity<=MAX_INVITES_PER_CODE &&
        Number.isSafeInteger(projection.remaining) &&
        projection.remaining>=0 && projection.remaining<=projection.capacity &&
        ["default","reported","reported-remaining"].includes(projection.basis)) {
      return {
        remaining:projection.remaining,total:projection.capacity,
        used:projection.capacity-projection.remaining,
        date:projection.reportedAt?formatDate(projection.reportedAt):null,
        basis:projection.basis
      };
    }
    // Non-built legacy JSON receives the same 30-slot display fallback.
    // Never turn a corrupt dated report into a default balance.
    if (typeof item.usageReportedAt !== "string") {
      if (["reportedRemaining","reportedCapacity","reportedUses"].some(key=>
          item[key]!==undefined)) return null;
      return {remaining:MAX_INVITES_PER_CODE,total:MAX_INVITES_PER_CODE,
        used:0,date:null,basis:"default"};
    }
    const date=formatDate(item.usageReportedAt);
    if (Number.isSafeInteger(item.reportedRemaining) &&
        item.reportedRemaining>=0 && item.reportedRemaining<=MAX_INVITES_PER_CODE &&
        item.reportedCapacity===undefined && item.reportedUses===undefined) {
      return {remaining:item.reportedRemaining,total:MAX_INVITES_PER_CODE,
        used:MAX_INVITES_PER_CODE-item.reportedRemaining,date,basis:"reported-remaining"};
    }
    if (!Number.isSafeInteger(item.reportedCapacity) ||
        !Number.isSafeInteger(item.reportedUses) ||
        item.reportedCapacity<1 || item.reportedCapacity>MAX_INVITES_PER_CODE ||
        item.reportedUses<0 || item.reportedUses>item.reportedCapacity) return null;
    return {remaining:item.reportedCapacity-item.reportedUses,
      total:item.reportedCapacity,used:item.reportedUses,date,basis:"reported"};
  }
  function setStat(id, value) {
    const target = document.getElementById(id);
    if (target) target.textContent = value;
  }
  function updateStats() {
    if (loadFailed) {
      ["stat-total", "stat-contributors", "stat-reported", "stat-tokens"].forEach(id => setStat(id, "—"));
      setStat("stat-token-context", "Token estimates unavailable because the directory could not load.");
      return;
    }
    const contributors = new Set(codes.map(c => {
      const origin = sourceInfo(c);
      return origin.handle ? origin.platform.toLowerCase() + ":" + origin.handle.toLowerCase() : null;
    }).filter(Boolean));
    const reported = codes.filter(c => {const q=reportedRemaining(c);return q && q.basis!=="default";});
    setStat("stat-total", codes.length.toLocaleString("en-US"));
    setStat("stat-contributors", contributors.size.toLocaleString("en-US"));
    setStat("stat-reported", reported.length.toLocaleString("en-US"));
    const potential = features.tokenPotential(codes);
    setStat("stat-tokens", potential.reportedCodes ?
      potential.potentialBillions.toLocaleString("en-US") + "B" : "—");
    setStat("stat-token-context", potential.reportedCodes ?
      potential.remainingUses.toLocaleString("en-US") + " reported remaining uses across " +
      potential.reportedCodes.toLocaleString("en-US") + " codes; " +
      potential.unknownCodes.toLocaleString("en-US") +
      " codes have no owner-reported availability. The 30/30 default shown on cards is a policy estimate, not a validated balance. This is potential, not earned tokens." :
      "No codes have reported remaining invite uses. Token potential is unknown.");
  }
  function fallbackCopy(value) {
    const input = el("textarea");
    input.value = value;
    input.readOnly = true;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
  }
  async function copyCode(value, button) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else if (!fallbackCopy(value)) {
        throw Error("Copy failed");
      }
      let stored = null;
      try {
        stored = features.rememberCopiedCode(window.localStorage, value);
      } catch { /* Disabled storage should not undo a successful clipboard copy. */ }
      if (stored) copiedCodes = new Set(stored);
      else copiedCodes.add(value);
      syncCopiedCards();
      button.replaceChildren(icon("fa-solid fa-check"), document.createTextNode(" Copied!"));
      announcer.textContent = "Copied " + value + " on this device. This does not confirm Muse redemption.";
    } catch {
      button.replaceChildren(icon("fa-solid fa-xmark"), document.createTextNode(" Copy failed"));
      announcer.textContent = "Unable to copy automatically. Open details to select the code.";
    }
    window.setTimeout(() => {
      if (button.isConnected) {
        const card = button.closest(".code-card");
        if (card) updateCopiedCard(card);
      }
    }, 2200);
  }
  function socialSource(value) {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
      const host = url.hostname.toLowerCase(), path = url.pathname;
      let found, platform, key, iconName, group = false;
      if (["threads.com", "www.threads.com"].includes(host)) {
        found = /^\/@([A-Za-z0-9_.]{1,30})(?:\/post\/[A-Za-z0-9_-]+)?\/?$/.exec(path);
        [platform,key,iconName] = ["Threads","threads","fa-brands fa-threads"];
      } else if (["x.com","www.x.com","twitter.com","www.twitter.com"].includes(host)) {
        found = /^\/([A-Za-z0-9_]{1,15})(?:\/status\/[0-9]{5,25})?\/?$/.exec(path);
        if (found && ["i","home","search","explore","intent","share","settings","messages"].includes(found[1].toLowerCase())) return null;
        [platform,key,iconName] = ["X (Twitter)","x","fa-brands fa-x-twitter"];
      } else if (["t.me","www.t.me"].includes(host)) {
        found = /^\/([A-Za-z][A-Za-z0-9_]{4,31})(?:\/[1-9][0-9]{0,18})?\/?$/.exec(path);
        if (found && ["share","joinchat","login","addstickers","proxy","socks","addemoji"].includes(found[1].toLowerCase())) return null;
        [platform,key,iconName] = ["Telegram","telegram","fa-brands fa-telegram"];
      } else if (["facebook.com","www.facebook.com","m.facebook.com"].includes(host)) {
        found = /^\/groups\/([A-Za-z0-9][A-Za-z0-9._-]{1,79})\/posts\/([1-9][0-9]{9,24})\/?$/.exec(path);
        group = Boolean(found);
        if (!group) found = /^\/([A-Za-z0-9.]{2,50})(?:\/posts\/[A-Za-z0-9_-]{4,120})?\/?$/.exec(path);
        if (found && ["share","groups","watch","reel","reels","events","marketplace","people","pages","profile.php","permalink.php","photo.php","login"].includes(found[1].toLowerCase())) return null;
        [platform,key,iconName] = ["Facebook","facebook","fa-brands fa-facebook-f"];
      }
      return found ? {platform,key,handle:found[1],url:url.href,icon:iconName,group} : null;
    } catch { return null; }
  }
  function sourceInfo(item) {
    return socialSource(item.sourceUrl) || {
      platform: "GitHub", key: "github", handle: item.submittedBy || null,
      url: item.submittedBy ? "https://github.com/" + encodeURIComponent(item.submittedBy) : null,
      icon: "fa-brands fa-github"
    };
  }
  function createCard(item) {
    const status = STATUS[item.status] || STATUS.unverified;
    const featured = item.featured === true;
    const ownerConfirmed = featured && item.ownerConfirmed === true;
    const card = el("article", featured ? "code-card code-card-featured" : "code-card");
    card.dataset.code = item.code;
    const head = el("div", "card-topline");
    const name = el("h3", "code-value");
    const codeLink = el("a", "code-link", item.code);
    codeLink.href = "./codes/" + encodeURIComponent(item.code) + "/";
    codeLink.setAttribute("aria-label", "Details for Muse invite code " + item.code);
    name.append(codeLink);
    const badge = el("span", "status-badge " +
      (ownerConfirmed ? "status-owner-verified" :
        featured ? "status-featured" : "status-" + item.status),
      ownerConfirmed ? "Verified Owner" : featured ? "Featured" : status.label);
    badge.title = ownerConfirmed
      ? "Owner-confirmed by ePlus.DEV. Muse redemption has not been independently confirmed."
      : status.description;
    if (ownerConfirmed) badge.prepend(icon("fa-solid fa-circle-check"));
    // Every card uses exactly the same hierarchy: status, code, source, facts, actions.
    // A verified owner is not proof that Muse accepts the invite.
    const statusRow = el("div", "card-status-row");
    const headActions = el("div", "card-head-actions");
    const saveButton = el("button", "card-save");
    saveButton.type = "button";
    saveButton.dataset.code = item.code;
    updateSaveButton(saveButton);
    saveButton.addEventListener("click", () => toggleSaved(item.code));
    headActions.append(saveButton);
    statusRow.append(badge, headActions);
    head.append(name);
    const contributor = el("div", "card-contributor");
    const source = sourceInfo(item);
    const sourceTag = el("span", "card-source" + (source.key === "github" ? "" : " card-source-" + source.key));
    sourceTag.append(icon(source.icon), document.createTextNode(" " + source.platform));
    contributor.append(sourceTag);
    if (source.handle && source.url) {
      const author = el("a", "card-author", (source.group ? "Group: " : "@") + source.handle);
      author.href = source.url;
      author.rel = "noopener noreferrer";
      author.target = "_blank";
      author.setAttribute("aria-label", source.group
        ? "View Facebook group post in " + source.handle
        : "View " + source.platform + " profile of " + source.handle);
      author.title = source.group
        ? "Facebook group post: " + source.handle
        : source.platform + " source: " + source.handle;
      contributor.append(author);
    } else {
      contributor.append(el("span", "card-author", "Community contributor"));
    }
    const info = el("div", "card-facts");
    const remaining = reportedRemaining(item);
    const amount = el("p", "card-availability");
    const availability = remaining
      ? remaining.remaining.toLocaleString("en-US") +
          (remaining.total === null ? "" : " / " + remaining.total.toLocaleString("en-US")) +
          (remaining.basis==="default"
            ? " remaining · default (unconfirmed)"
            : remaining.basis==="reported-remaining"
              ? " remaining · reported (30 max)"
              : " remaining · reported")
      : "Not reported";
    amount.title = remaining
      ? remaining.basis==="default"
        ? "Policy default: 30/30 displayed, 0 used estimated. No owner report; actual availability is unknown."
        : "Community count reported " + remaining.date + "; " + remaining.used +
          (remaining.basis==="reported-remaining" ? " used estimated against 30 max." : " used reported.") +
          " Not live Muse availability."
      : "An incomplete or invalid report has not been published as a balance.";
    amount.setAttribute("aria-label", "Availability: " + availability +
      (remaining?.date ? ", as of " + remaining.date + ", not live" :
        ", not an owner-verified balance"));
    amount.append(icon("fa-solid fa-chart-simple"));
    amount.append(document.createTextNode(" Availability: " + availability));
    info.append(amount);
    const date = el("p", "card-date");
    date.append(icon("fa-regular fa-clock"));
    date.append(document.createTextNode(" Listed: " + formatDate(item.addedAt)));
    info.append(date);
    const actions = el("div", "card-actions");
    const copy = el("button", "card-copy");
    copy.type = "button";
    copy.dataset.tooltip = "Copy this code. Copying does not redeem it in Muse.";
    copy.setAttribute("aria-label", "Copy Muse invite code " + item.code);
    copy.append(icon("fa-regular fa-copy"), document.createTextNode(" Copy code"));
    copy.addEventListener("click", () => copyCode(item.code, copy));
    const openInvite = el("a", "card-open-invite");
    openInvite.href = features.museInviteUrl(item.code);
    openInvite.target = "_blank";
    openInvite.rel = "noopener noreferrer";
    openInvite.dataset.tooltip = "Open the code-specific Muse link. Only Muse can confirm redemption.";
    openInvite.setAttribute("aria-label", "Open Muse invite link for code " + item.code);
    openInvite.append(icon("fa-solid fa-arrow-up-right-from-square"), document.createTextNode(" Open invite"));
    const primaryActions = el("div", "card-primary-actions");
    primaryActions.append(copy, openInvite);
    const subActions = el("div", "card-subactions");
    const details = el("a", "card-utility-link card-detail-link");
    details.dataset.tooltip = "See the source, report date and details for this code.";
    details.setAttribute("aria-label", "View details for Muse invite code " + item.code);
    details.href = "./codes/" + encodeURIComponent(item.code) + "/";
    details.append(icon("fa-solid fa-circle-info"));
    const report = el("a", "card-utility-link card-feedback-link");
    report.setAttribute("aria-label", "Give feedback on Muse invite code " + item.code);
    report.append(icon("fa-regular fa-comment-dots"));
    report.dataset.tooltip = "Comment on this code's existing GitHub Issue. New feedback reopens it for review.";
    report.href = feedbackIssue(item.code);
    report.addEventListener("click", event => prepareFeedback(event, item, "other"));
    report.target = "_blank";
    report.rel = "noopener noreferrer";
    subActions.append(details, report);
    if (item.submittedBy && !item.sourceUrl) {
      const countLink = el("a", "card-utility-link card-count-link");
      countLink.setAttribute("aria-label", "Update owner invite count for code " + item.code);
      countLink.append(icon("fa-solid fa-arrow-rotate-right"));
      // Show only documented, accepted quota revisions; not visits or click counts.
      // Documented pre-tracking revisions are in a trusted sidecar so the
      // public preview catalog remains compatible with main's schema.
      // Future approved revisions are counted separately in the record.
      const tracked = Number.isSafeInteger(item.quotaUpdateCount) &&
        item.quotaUpdateCount > 0 ? item.quotaUpdateCount : 0;
      const baseline = Number.isSafeInteger(quotaUpdateBaselines[item.code]) &&
        quotaUpdateBaselines[item.code] > 0 ? quotaUpdateBaselines[item.code] : 0;
      const updates = tracked + baseline;
      if (Number.isSafeInteger(updates) && updates > 0) {
        const counter = el("span", "card-count-updates", updates > 99 ? "99+" : String(updates));
        counter.setAttribute("aria-hidden", "true");
        countLink.append(counter);
        countLink.setAttribute("aria-label", "Update owner invite count for code " +
          item.code + " — " + updates + " recorded quota " +
          (updates === 1 ? "update" : "updates"));
      }
      countLink.href = feedbackIssue(item.code, "count");
      countLink.target = "_blank";
      countLink.rel = "noopener noreferrer";
      countLink.dataset.tooltip = "For the original GitHub owner: report a dated quota snapshot on the same Issue." +
        (Number.isSafeInteger(updates) && updates > 0
          ? " " + updates + " accepted quota " + (updates === 1 ? "update" : "updates") +
            " recorded since the first report."
          : " No accepted quota revisions are recorded yet.");
      countLink.addEventListener("click", event => prepareFeedback(event, item, "count"));
      subActions.append(countLink);
    }
    const quickFeedback = el("div", "card-feedback-actions");
    quickFeedback.setAttribute("role", "group");
    quickFeedback.setAttribute("aria-label", "Report invite code experience");
    for (const [outcome, text, iconName] of [
      ["worked", "Worked for me", "fa-regular fa-thumbs-up"],
      ["failed", "Didn't work", "fa-regular fa-thumbs-down"]
    ]) {
      const link = el("a", "card-quick-feedback card-quick-" + outcome);
      link.href = feedbackIssue(item.code, outcome);
      link.addEventListener("click", event => prepareFeedback(event, item, outcome));
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.dataset.tooltip = outcome === "worked" ?
        "Review a prepared success report, then copy and comment on the original Issue." :
        "Review a prepared failure report, then copy and comment on the original Issue.";
      link.setAttribute("aria-label", text + " — report Muse invite code " + item.code + " on GitHub");
      link.append(icon(iconName));
      const summary = feedbackCounts?.[item.code];
      const total = summary?.[outcome];
      if (Number.isSafeInteger(total) && total >= 0) {
        const counter = el("span", "card-feedback-count", total > 999 ? "999+" : String(total));
        counter.setAttribute("aria-hidden", "true");
        link.append(counter);
        link.classList.add("has-count");
        const description = total + " community " +
          (total === 1 ? "report" : "reports") + " of " +
          (outcome === "worked" ? "success" : "failure");
        link.dataset.tooltip += " " + description +
          " in the last published GitHub snapshot; not live or independently verified by Muse.";
        link.setAttribute("aria-label", text + " — " + description +
          " for Muse invite code " + item.code);
      }
      quickFeedback.append(link);
    }
    const utilityBar = el("div", "card-utility-bar");
    utilityBar.append(quickFeedback, subActions);
    actions.append(primaryActions, utilityBar);
    card.append(statusRow, head, contributor, info, actions);
    updateCopiedCard(card);
    return card;
  }
  function render(resetLimit = false) {
    if (resetLimit) displayLimit = PAGE_SIZE;
    const q = searchInput.value.trim().toLowerCase();
    const visible = codes.filter(item =>
      (sourceFilter === "all" ||
       (sourceFilter === "saved" ? savedCodes.has(item.code) :
        sourceInfo(item).key === sourceFilter)) &&
      (item.code.toLowerCase().includes(q) ||
       String(item.submittedBy || "").toLowerCase().includes(q) ||
       String(sourceInfo(item).handle || "").toLowerCase().includes(q) ||
       String(item.note || "").toLowerCase().includes(q))
    );
    visible.sort((a, b) => features.compareCodes(a, b, sortValue));
    const page = visible.slice(0, displayLimit);
    grid.replaceChildren(...page.map(createCard));
    resultCount.textContent = "Showing " + page.length.toLocaleString("en-US") +
      " of " + visible.length.toLocaleString("en-US") + " codes";
    more.hidden = visible.length <= displayLimit;
    if (!more.hidden) moreButton.firstChild.textContent =
      "Load " + Math.min(PAGE_SIZE, visible.length - displayLimit) + " more ";
    empty.hidden = visible.length !== 0;
    grid.hidden = visible.length === 0;
    if (visible.length === 0) {
      const title = document.getElementById("empty-title");
      const description = document.getElementById("empty-description");
      title.textContent = loadFailed ? "Couldn't load invite codes." :
        codes.length === 0 ? "Be the first to share." :
        sourceFilter === "saved" && savedCodes.size === 0 ?
        "No saved codes yet." : "No matching codes.";
      description.textContent = loadFailed ?
        "Check your connection and refresh. You can still share codes through GitHub." :
        codes.length === 0 ? "No invite codes have been published yet." :
        sourceFilter === "saved" && savedCodes.size === 0 ?
        "Use the bookmark icon on a code to save it on this device." :
        "Try another search term or source filter. Saved codes stay only in this browser.";
    }
  }
  async function initialize() {
    const controller = new AbortController();
    const requestTimeout = window.setTimeout(() => controller.abort(), 7500);
    try {
      const response = await fetch("./data/invites.json", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw Error("HTTP " + response.status);
      const list = await response.json();
      if (!Array.isArray(list)) throw Error("Invite catalog must be an array");
      codes = list.filter(item => item && typeof item.code === "string" &&
        typeof item.addedAt === "string" && Object.hasOwn(STATUS, item.status));
      try {
        const mapResponse = await fetch("./data/code-issues.json",
          { cache: "no-store", signal: controller.signal });
        if (!mapResponse.ok) throw Error("Issue map HTTP " + mapResponse.status);
        const received = await mapResponse.json();
        if (received && typeof received === "object" && !Array.isArray(received)) {
          codeIssueMap = received;
        }
      } catch (error) {
        // Use the repository Issue list, never an extra feedback Issue Form.
        console.warn("Canonical issue links unavailable:", error);
      }
      try {
        const baselineResponse = await fetch("./data/quota-update-baseline.json",
          {cache:"no-store",signal:controller.signal});
        if (!baselineResponse.ok) throw Error("Quota history unavailable");
        const baseline = await baselineResponse.json();
        if (baseline && !Array.isArray(baseline) && typeof baseline === "object") {
          quotaUpdateBaselines = baseline;
        }
      } catch {
        // Historical count missing: show only catalog-tracked updates.
        quotaUpdateBaselines = {};
      }
      try {
        const feedbackResponse = await fetch("./data/feedback-counts.json",
          {cache:"no-store",signal:controller.signal});
        if (!feedbackResponse.ok) throw Error("Feedback totals unavailable");
        const snapshot = await feedbackResponse.json();
        if (snapshot?.source === "reviewed-github-feedback" && snapshot.codes &&
            !Array.isArray(snapshot.codes) && typeof snapshot.codes === "object" &&
            Number.isFinite(Date.parse(snapshot.generatedAt || ""))) {
          feedbackCounts = snapshot.codes;
        }
      } catch {
        // Missing/incomplete GitHub snapshots must not be rendered as fake zero votes.
        feedbackCounts = null;
      }
    } catch (error) {
      console.error("Could not load invite directory:", error);
      loadFailed = true;
      codes = [];
    } finally {
      window.clearTimeout(requestTimeout);
    }
    updateStats();
    syncSavedUi();
    render();
    document.documentElement.classList.remove("is-page-loading");
  }
  searchInput.addEventListener("input", () => render(true));
  for (const button of sourceFilters) {
    button.addEventListener("click", () => {
      sourceFilter = button.dataset.source;
      for (const entry of sourceFilters) {
        const selected = entry === button;
        entry.setAttribute("aria-pressed", String(selected));
        entry.classList.toggle("is-active", selected);
      }
      render(true);
    });
  }
  window.addEventListener("storage", event => {
    if (event.key === features.COPIED_STORAGE_KEY || event.key === null) {
      copiedCodes = new Set(features.parseCopied(event.key === null ? null : event.newValue));
      syncCopiedCards();
    }
    if (event.key === features.STORAGE_KEY || event.key === null) {
      savedCodes = new Set(features.parseSaved(event.key === null ? null : event.newValue));
      syncSavedUi();
      if (sourceFilter === "saved") render(true);
    }
  });
  function closeSortMenu(restoreFocus = false) {
    sortMenu.hidden = true;
    sortTrigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) sortTrigger.focus();
  }
  function openSortMenu(index = sortOptions.findIndex(option => option.dataset.sort === sortValue)) {
    sortMenu.hidden = false;
    sortTrigger.setAttribute("aria-expanded", "true");
    sortOptions[Math.max(0, index)].focus();
  }
  sortTrigger.addEventListener("click", () => {
    if (sortMenu.hidden) openSortMenu();
    else closeSortMenu(true);
  });
  sortTrigger.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openSortMenu(event.key === "ArrowDown" ? 0 : sortOptions.length - 1);
    }
  });
  sortMenu.addEventListener("click", event => {
    const option = event.target.closest(".sort-option");
    if (!option || !sortMenu.contains(option)) return;
    sortValue = option.dataset.sort;
    sortCurrent.textContent = option.textContent;
    sortTrigger.dataset.tooltip = option.dataset.sort === "updated" ?
      "Most recent recorded listing, usage report or catalog check. Not live availability." :
      "Sort the directory. Featured listings stay pinned at the top.";
    for (const entry of sortOptions) {
      entry.setAttribute("aria-checked", String(entry === option));
    }
    closeSortMenu(true);
    features.enableTooltips()?.hide();
    render(true);
  });
  sortMenu.addEventListener("keydown", event => {
    const index = sortOptions.indexOf(document.activeElement);
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % sortOptions.length;
    else if (event.key === "ArrowUp") next = (index - 1 + sortOptions.length) % sortOptions.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = sortOptions.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      closeSortMenu(true);
      return;
    } else if (event.key === "Tab") {
      closeSortMenu();
      return;
    } else return;
    event.preventDefault();
    sortOptions[next].focus();
  });
  document.addEventListener("pointerdown", event => {
    if (!sortTrigger.parentElement.contains(event.target)) closeSortMenu();
  });
  moreButton.addEventListener("click", () => {
    const previousCount = grid.children.length;
    displayLimit += PAGE_SIZE;
    render();
    const next = grid.children[previousCount];
    if (next) {
      next.tabIndex = -1;
      next.focus({ preventScroll: true });
    }
    announcer.textContent = "Loaded more invite codes.";
  });
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      searchInput.focus();
    }
    if (event.key === "Escape" && document.activeElement === searchInput) searchInput.blur();
  });
  initialize();
})();
