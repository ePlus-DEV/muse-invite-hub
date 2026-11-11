(() => {
  "use strict";
  const button = document.getElementById("detail-copy");
  const code = document.getElementById("detail-code");
  const live = document.getElementById("detail-live");
  if (!button || !code || !live) return;
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
