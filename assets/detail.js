(() => {
  "use strict";
  const button = document.getElementById("detail-copy");
  const code = document.getElementById("detail-code");
  const live = document.getElementById("detail-live");
  if (!button || !code || !live) return;
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
      button.textContent = "✓ Copied!";
      live.textContent = "Copied invitation code " + value + ". Open Muse to try redeeming it.";
      window.setTimeout(() => { button.textContent = "Copy invite code"; }, 2400);
    } catch {
      button.textContent = "Copy failed";
      live.textContent = "Select and copy the code manually.";
      window.setTimeout(() => { button.textContent = "Copy invite code"; }, 2400);
    }
  });
})();
