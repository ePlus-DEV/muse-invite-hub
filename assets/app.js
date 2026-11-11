(() => {
  "use strict";
  const REPO = "https://github.com/ePlus-DEV/muse-invite-hub";
  const STATUS = {
    "reported-working": { label: "Reported working", className: "status-reported-working", description: "Community reported this code worked; not verified by Muse." },
    "unverified": { label: "Unverified", className: "", description: "Shared by the community; no redemption feedback yet." },
    "reported-not-working": { label: "Reported not working", className: "status-reported-not-working", description: "Community has reported a problem with this code." }
  };
  const grid = document.getElementById("code-grid");
  const empty = document.getElementById("empty-state");
  const searchInput = document.getElementById("code-search");
  const sortInput = document.getElementById("sort-codes");
  const resultCount = document.getElementById("result-count");
  const announcer = document.getElementById("live-message");
  const filters = Array.from(document.querySelectorAll("[data-filter]"));
  let codes = [];
  let filter = "all";
  let loadFailed = false;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function announce(message) {
    announcer.textContent = message;
  }
  function formatDate(date) {
    if (!date) return "Date unknown";
    const parsed = new Date(date + "T00:00:00Z");
    if (Number.isNaN(parsed.getTime())) return "Date unknown";
    return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  }
  function issueUrl(template, code) {
    const base = REPO + "/issues/new?template=" + encodeURIComponent(template);
    return code ? base + "&invite_code=" + encodeURIComponent(code) : base;
  }
  function updateStats() {
    document.getElementById("stat-total").textContent = codes.length.toLocaleString("en-US");
    document.getElementById("stat-working").textContent = codes.filter(c => c.status === "reported-working").length.toLocaleString("en-US");
    document.getElementById("stat-unverified").textContent = codes.filter(c => c.status === "unverified").length.toLocaleString("en-US");
  }
  function fallbackCopy(text) {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.append(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    return ok;
  }
  async function copyCode(code, button) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(code);
      else if (!fallbackCopy(code)) throw new Error("Copy failed");
      button.textContent = "✓ Copied!";
      announce("Copied invite code " + code + ". Paste it in Muse to try redeeming.");
      window.setTimeout(() => { if (button.isConnected) button.textContent = "Copy code"; }, 2200);
    } catch {
      announce("Unable to copy automatically. Select the displayed code to copy it.");
      button.textContent = "Copy failed";
      window.setTimeout(() => { if (button.isConnected) button.textContent = "Copy code"; }, 2200);
    }
  }
  function createCard(item) {
    const status = STATUS[item.status] || STATUS.unverified;
    const card = el("article", "code-card");
    const top = el("div", "card-topline");
    const indicator = el("div", "card-indicator");
    indicator.append(el("span", "dot"), el("span", "", "COMMUNITY CODE"));
    const badge = el("span", "status-badge " + status.className, status.label);
    badge.title = status.description;
    top.append(indicator, badge);

    const value = el("h3", "code-value", item.code);
    const note = el("p", "code-note", item.note || "Shared with the Muse community.");
    const meta = el("div", "card-meta");
    meta.append(el("span", "", "Listed " + formatDate(item.addedAt)));
    if (item.submittedBy) {
      const author = el("a", "", "@" + item.submittedBy);
      author.href = "https://github.com/" + encodeURIComponent(item.submittedBy);
      author.target = "_blank";
      author.rel = "noopener noreferrer";
      meta.append(author);
    } else {
      meta.append(el("span", "", "Community submitted"));
    }
    if (item.sourceUrl) {
      try {
        const source = new URL(item.sourceUrl);
        if (source.protocol === "https:") {
          const sourceLink = el("a", "", "Original source ↗");
          sourceLink.href = source.href;
          sourceLink.target = "_blank";
          sourceLink.rel = "noopener noreferrer";
          sourceLink.title = "Public source of this community invitation";
          meta.append(sourceLink);
        }
      } catch { /* Malformed source references are discarded. */ }
    }
    let usageNote = null;
    if (Number.isInteger(item.reportedUses) && Number.isInteger(item.reportedCapacity) && item.usageReportedAt) {
      usageNote = el("p", "card-usage", "Owner-reported uses: " + item.reportedUses + "/" + item.reportedCapacity + " · " + formatDate(item.usageReportedAt) + " · Not live");
    }
    const actions = el("div", "card-actions");
    const copy = el("button", "", "Copy code");
    copy.type = "button";
    copy.setAttribute("aria-label", "Copy invite code " + item.code);
    copy.addEventListener("click", () => copyCode(item.code, copy));
    const report = el("a", "", "Give feedback ↗");
    report.href = issueUrl("report-code.yml", item.code);
    report.target = "_blank";
    report.rel = "noopener noreferrer";
    report.setAttribute("aria-label", "Report an issue with invite code " + item.code);
    actions.append(copy, report);
    card.append(top, value, note);
    if (usageNote) card.append(usageNote);
    card.append(meta, actions);
    return card;
  }
  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const visible = codes.filter(item => (filter === "all" || item.status === filter) && (
      item.code.toLowerCase().includes(q) ||
      String(item.submittedBy || "").toLowerCase().includes(q) ||
      String(item.note || "").toLowerCase().includes(q)
    ));
    const sort = sortInput.value;
    visible.sort((a, b) => sort === "code" ? a.code.localeCompare(b.code) : sort === "oldest" ?
      a.addedAt.localeCompare(b.addedAt) : b.addedAt.localeCompare(a.addedAt));
    grid.replaceChildren(...visible.map(createCard));
    resultCount.textContent = visible.length.toLocaleString("en-US") + " " + (visible.length === 1 ? "code" : "codes") + " found";
    empty.hidden = visible.length !== 0;
    if (visible.length === 0) {
      grid.hidden = true;
      const title = document.getElementById("empty-title");
      const desc = document.getElementById("empty-description");
      if (loadFailed) {
        title.textContent = "Couldn't load the directory.";
        desc.textContent = "Check your connection and try refreshing the page. You can still contribute on GitHub.";
      } else if (codes.length === 0) {
        title.textContent = "Your first spark starts here.";
        desc.textContent = "No invite codes have been published yet. Be the first to share one with the community.";
      } else {
        title.textContent = "No matching codes.";
        desc.textContent = "Try another search or change the filter to see more community invitations.";
      }
    } else {
      grid.hidden = false;
    }
  }
  async function initialize() {
    try {
      const response = await fetch("./data/invites.json", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid catalog format");
      codes = data.filter(item => item && typeof item.code === "string" &&
        typeof item.addedAt === "string" && Object.prototype.hasOwnProperty.call(STATUS, item.status));
    } catch (error) {
      console.error("Could not load invite directory:", error);
      loadFailed = true;
      codes = [];
    }
    updateStats();
    render();
  }
  filters.forEach(button => button.addEventListener("click", () => {
    filter = button.dataset.filter;
    filters.forEach(item => {
      const isActive = item === button;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
    render();
  }));
  searchInput.addEventListener("input", render);
  sortInput.addEventListener("change", render);
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
