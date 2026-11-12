(() => {
  "use strict";
  const REPO = "https://github.com/ePlus-DEV/muse-invite-hub";
  const STATUS = {
    "reported-working": { label: "Reported working", description: "A community member reported this code worked; not verified by Muse." },
    "unverified": { label: "Unverified", description: "Shared by the community; no confirmed redemption feedback." },
    "reported-not-working": { label: "Reported not working", description: "A community member reported a redemption problem." }
  };
  const grid = document.getElementById("code-grid");
  const searchInput = document.getElementById("code-search");
  const sortInput = document.getElementById("sort-codes");
  const resultCount = document.getElementById("result-count");
  const more = document.getElementById("directory-more");
  const moreButton = document.getElementById("load-more-codes");
  const empty = document.getElementById("empty-state");
  const announcer = document.getElementById("live-message");
  const PAGE_SIZE = 12;
  let displayLimit = PAGE_SIZE;
  let codes = [];
  let loadFailed = false;

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
  function issueUrl(template, code) {
    const url = REPO + "/issues/new?template=" + encodeURIComponent(template);
    return code ? url + "&invite_code=" + encodeURIComponent(code) : url;
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
    const contributors = new Set(codes.map(c => c.submittedBy).filter(Boolean));
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
      (featured ? "status-featured" : "status-" + item.status),
      featured ? "Featured" : status.label);
    badge.title = ownerConfirmed
      ? "Verified Owner: ownership is confirmed; Muse redemption is unverified."
      : status.description;
    head.append(name, badge);
    const contributor = el("div", "card-contributor");
    contributor.append(icon("fa-regular fa-user"));
    if (item.submittedBy) {
      const author = el("a", "card-author", "@" + item.submittedBy);
      author.href = "https://github.com/" + encodeURIComponent(item.submittedBy);
      author.rel = "noopener noreferrer";
      author.target = "_blank";
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
      const ownership = el("p", "card-owner");
      ownership.append(icon("fa-solid fa-circle-check"));
      ownership.append(document.createTextNode(" Verified Owner · Redemption unverified"));
      info.append(ownership);
    }
    const actions = el("div", "card-actions");
    const copy = el("button", "card-copy");
    copy.type = "button";
    copy.setAttribute("aria-label", "Copy Muse invite code " + item.code);
    copy.append(icon("fa-regular fa-copy"), document.createTextNode(" Copy code"));
    copy.addEventListener("click", () => copyCode(item.code, copy));
    const subActions = el("div", "card-subactions");
    const details = el("a", "card-detail-link", "View details");
    details.href = "./codes/" + encodeURIComponent(item.code) + "/";
    const report = el("a", "card-feedback-link", "Give feedback");
    report.href = issueUrl("report-code.yml", item.code);
    report.target = "_blank";
    report.rel = "noopener noreferrer";
    subActions.append(details, report);
    actions.append(copy, subActions);
    card.append(head, contributor, info, actions);
    return card;
  }
  function render(resetLimit = false) {
    if (resetLimit) displayLimit = PAGE_SIZE;
    const q = searchInput.value.trim().toLowerCase();
    const visible = codes.filter(item =>
      item.code.toLowerCase().includes(q) ||
      String(item.submittedBy || "").toLowerCase().includes(q) ||
      String(item.note || "").toLowerCase().includes(q)
    );
    const sort = sortInput.value;
    visible.sort((a, b) => {
      if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
      return sort === "code" ? a.code.localeCompare(b.code) : sort === "oldest"
        ? a.addedAt.localeCompare(b.addedAt) : b.addedAt.localeCompare(a.addedAt);
    });
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
        codes.length === 0 ? "Be the first to share." : "No matching codes.";
      description.textContent = loadFailed ?
        "Check your connection and refresh. You can still share codes through GitHub." :
        codes.length === 0 ? "No invite codes have been published yet." :
        "Try a different code or contributor.";
    }
  }
  async function initialize() {
    try {
      const response = await fetch("./data/invites.json", { cache: "no-store" });
      if (!response.ok) throw Error("HTTP " + response.status);
      const list = await response.json();
      if (!Array.isArray(list)) throw Error("Invite catalog must be an array");
      codes = list.filter(item => item && typeof item.code === "string" &&
        typeof item.addedAt === "string" && Object.hasOwn(STATUS, item.status));
    } catch (error) {
      console.error("Could not load invite directory:", error);
      loadFailed = true;
      codes = [];
    }
    updateStats();
    render();
  }
  searchInput.addEventListener("input", () => render(true));
  sortInput.addEventListener("change", () => render(true));
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
