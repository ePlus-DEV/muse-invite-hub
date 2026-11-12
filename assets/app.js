(() => {
  "use strict";
  const features = window.MuseDirectoryFeatures;
  if (!features) throw Error("Missing directory helpers");
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
  function feedbackIssue(code, outcome = "other") {
    return features.quickFeedbackUrl(code, outcome, features.issueNumberFor(codeIssueMap, code));
  }
  function copySuggestedFeedback(code, outcome) {
    // User-triggered only. GitHub does not accept comment prefill via URL.
    if (!navigator.clipboard || !window.isSecureContext) return;
    void navigator.clipboard.writeText(features.feedbackComment(code, outcome))
      .then(() => { announcer.textContent = "Suggested report copied. Paste it into the existing GitHub Issue comment."; })
      .catch(() => { announcer.textContent = "Write your result as a comment on the existing GitHub Issue."; });
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
    if (!item || typeof item.usageReportedAt !== "string") return null;
    const date = formatDate(item.usageReportedAt);
    if (Number.isInteger(item.reportedRemaining) && item.reportedRemaining >= 0) {
      return { remaining: item.reportedRemaining, total: null, date };
    }
    if (!Number.isInteger(item.reportedUses) ||
        !Number.isInteger(item.reportedCapacity) ||
        item.reportedCapacity < 1 || item.reportedUses < 0 ||
        item.reportedUses > item.reportedCapacity) return null;
    return {
      remaining: item.reportedCapacity - item.reportedUses,
      total: item.reportedCapacity, date
    };
  }
  function setStat(id, value) {
    const target = document.getElementById(id);
    if (target) target.textContent = value;
  }
  function updateStats() {
    if (loadFailed) {
      ["stat-total", "stat-contributors", "stat-reported"].forEach(id => setStat(id, "—"));
      return;
    }
    const contributors = new Set(codes.map(c => {
      const origin = sourceInfo(c);
      return origin.handle ? origin.platform.toLowerCase() + ":" + origin.handle.toLowerCase() : null;
    }).filter(Boolean));
    const reported = codes.filter(c => reportedRemaining(c) !== null);
    setStat("stat-total", codes.length.toLocaleString("en-US"));
    setStat("stat-contributors", contributors.size.toLocaleString("en-US"));
    setStat("stat-reported", reported.length.toLocaleString("en-US"));
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
      button.replaceChildren(icon("fa-solid fa-check"), document.createTextNode(" Copied!"));
      announcer.textContent = "Copied " + value + ". Paste it into Muse to check redemption.";
    } catch {
      button.replaceChildren(icon("fa-solid fa-xmark"), document.createTextNode(" Copy failed"));
      announcer.textContent = "Unable to copy automatically. Open details to select the code.";
    }
    window.setTimeout(() => {
      if (button.isConnected) {
        button.replaceChildren(icon("fa-regular fa-copy"), document.createTextNode(" Copy code"));
      }
    }, 2200);
  }
  function socialSource(value) {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
      const host = url.hostname.toLowerCase(), path = url.pathname;
      let found, platform, key, iconName;
      if (["threads.com", "www.threads.com"].includes(host)) {
        found = /^\/@([A-Za-z0-9_.]{1,30})(?:\/post\/[A-Za-z0-9_-]+)?\/?$/.exec(path);
        [platform,key,iconName] = ["Threads","threads","fa-brands fa-threads"];
      } else if (["x.com","www.x.com","twitter.com","www.twitter.com"].includes(host)) {
        found = /^\/([A-Za-z0-9_]{1,15})(?:\/status\/[0-9]{5,25})?\/?$/.exec(path);
        if (found && ["i","home","search","explore","intent","share","settings","messages"].includes(found[1].toLowerCase())) return null;
        [platform,key,iconName] = ["X (Twitter)","x","fa-brands fa-x-twitter"];
      } else if (["facebook.com","www.facebook.com","m.facebook.com"].includes(host)) {
        found = /^\/([A-Za-z0-9.]{2,50})(?:\/posts\/[A-Za-z0-9_-]{4,120})?\/?$/.exec(path);
        if (found && ["share","groups","watch","reel","reels","events","marketplace","people","pages","profile.php","permalink.php","photo.php","login"].includes(found[1].toLowerCase())) return null;
        [platform,key,iconName] = ["Facebook","facebook","fa-brands fa-facebook-f"];
      }
      return found ? {platform,key,handle:found[1],url:url.href,icon:iconName} : null;
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
    const headActions = el("div", "card-head-actions");
    const saveButton = el("button", "card-save");
    saveButton.type = "button";
    saveButton.dataset.code = item.code;
    updateSaveButton(saveButton);
    saveButton.addEventListener("click", () => toggleSaved(item.code));
    headActions.append(badge, saveButton);
    head.append(name, headActions);
    const contributor = el("div", "card-contributor");
    const source = sourceInfo(item);
    const sourceTag = el("span", "card-source" + (source.key === "github" ? "" : " card-source-" + source.key));
    sourceTag.append(icon(source.icon), document.createTextNode(" " + source.platform));
    contributor.append(sourceTag);
    if (source.handle && source.url) {
      const author = el("a", "card-author", "@" + source.handle);
      author.href = source.url;
      author.rel = "noopener noreferrer";
      author.target = "_blank";
      author.setAttribute("aria-label", "View " + source.platform + " profile of " + source.handle);
      contributor.append(author);
    } else {
      contributor.append(el("span", "", "Community contributor"));
    }
    const info = el("div", "card-facts");
    const remaining = reportedRemaining(item);
    const amount = el("p", "card-availability");
    amount.append(icon("fa-solid fa-chart-simple"));
    amount.append(document.createTextNode(remaining
      ? " " + remaining.remaining.toLocaleString("en-US") +
          (remaining.total === null ? "" : " of " + remaining.total.toLocaleString("en-US")) +
          " remaining (reported)"
      : " Availability not reported"));
    info.append(amount);
    const date = el("p", "card-date");
    date.append(icon("fa-regular fa-clock"));
    date.append(document.createTextNode(remaining
      ? " " + remaining.date + " · Not live"
      : " Listed " + formatDate(item.addedAt)));
    info.append(date);
    if (ownerConfirmed) {
      const redemption = el("p", "card-redemption");
      redemption.append(icon("fa-solid fa-circle-info"));
      redemption.append(document.createTextNode(" Muse redemption not independently confirmed"));
      info.append(redemption);
    }
    const actions = el("div", "card-actions");
    const copy = el("button", "card-copy");
    copy.type = "button";
    copy.dataset.tooltip = "Copy this code. Copying does not redeem it in Muse.";
    copy.setAttribute("aria-label", "Copy Muse invite code " + item.code);
    copy.append(icon("fa-regular fa-copy"), document.createTextNode(" Copy code"));
    copy.addEventListener("click", () => copyCode(item.code, copy));
    const subActions = el("div", "card-subactions");
    const details = el("a", "card-detail-link", "View details");
    details.dataset.tooltip = "See the source, report date and details for this code.";
    details.href = "./codes/" + encodeURIComponent(item.code) + "/";
    const report = el("a", "card-feedback-link", "Give feedback");
    report.dataset.tooltip = "Comment on this code's existing GitHub Issue. New feedback reopens it for review.";
    report.href = feedbackIssue(item.code);
    report.target = "_blank";
    report.rel = "noopener noreferrer";
    subActions.append(details, report);
    const quickFeedback = el("div", "card-feedback-actions");
    for (const [outcome, text, iconName] of [
      ["worked", "Worked for me", "fa-regular fa-thumbs-up"],
      ["failed", "Didn't work", "fa-regular fa-thumbs-down"]
    ]) {
      const link = el("a", "card-quick-feedback card-quick-" + outcome);
      link.href = feedbackIssue(item.code, outcome);
      link.addEventListener("click", () => copySuggestedFeedback(item.code, outcome));
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.dataset.tooltip = outcome === "worked" ?
        "Open this code's original GitHub Issue. A suggested report is copied for you to paste." :
        "Report a redemption problem on the existing Issue. Paste the suggested comment.";
      link.setAttribute("aria-label", text + " — report Muse invite code " + item.code + " on GitHub");
      link.append(icon(iconName), document.createTextNode(" " + text));
      quickFeedback.append(link);
    }
    actions.append(copy, quickFeedback, subActions);
    card.append(head, contributor, info, actions);
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
    if (event.key !== features.STORAGE_KEY && event.key !== null) return;
    savedCodes = new Set(features.parseSaved(event.key === null ? null : event.newValue));
    syncSavedUi();
    if (sourceFilter === "saved") render(true);
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
