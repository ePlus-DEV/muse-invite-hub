(() => {
  "use strict";
  const button = document.getElementById("detail-copy");
  const code = document.getElementById("detail-code");
  const live = document.getElementById("detail-live");
  if (!button || !code || !live) return;

  // Hosted PR previews generate HTML with trusted main scripts. Enhance Threads attribution
  // from the preview-approved catalog without executing untrusted HTML or adding new schema keys.
  async function showThreadsProvenance() {
    try {
      const response = await fetch("../../data/invites.json", { cache: "no-store" });
      if (!response.ok) return;
      const entries = await response.json();
      if (!Array.isArray(entries)) return;
      const entry = entries.find(item => item?.code === code.textContent.trim());
      if (!entry || typeof entry.sourceUrl !== "string") return;
      const url = new URL(entry.sourceUrl);
      const match = /^\/@([A-Za-z0-9_.]{1,30})(?:\/post\/[A-Za-z0-9_-]+)?\/?$/.exec(url.pathname);
      if (url.protocol !== "https:" ||
          !["threads.com", "www.threads.com"].includes(url.hostname.toLowerCase()) ||
          url.username || url.password || url.search || url.hash || !match) return;
      const handle = "@" + match[1];
      const owner = document.querySelector(".detail-owner");
      if (owner) owner.textContent = handle;
      const meta = document.querySelector(".detail-meta");
      if (!meta) return;
      const rows = [...meta.querySelectorAll("div")];
      const contributor = rows.find(row => row.querySelector("dt")?.textContent === "Contributor");
      if (contributor?.querySelector("dd")) contributor.querySelector("dd").textContent = handle;
      const source = rows.find(row => row.querySelector("dt")?.textContent === "Source");
      if (source) return; // Already server-rendered on production after merge.
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      const link = document.createElement("a");
      dt.textContent = "Source";
      link.textContent = "Threads · " + handle;
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      dd.append(link);
      row.append(dt, dd);
      contributor?.after(row);
      if (!contributor) meta.prepend(row);
    } catch { /* Keep the trusted server-rendered detail page if data is unavailable. */ }
  }
  void showThreadsProvenance();
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
