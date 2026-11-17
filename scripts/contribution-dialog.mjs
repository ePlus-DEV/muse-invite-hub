// One trustworthy, accessible choice dialog on home, country map, and code details.
// Kept static to avoid fetching data or injecting any untrusted contribution text.
export function renderContributionDialog(prefix="./") {
  if (!["./","../","../../"].includes(prefix)) throw Error("Unexpected page path");
  const github="https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml";
  const telegram="https://t.me/muse_invite_hub_bot";
  return `  <dialog id="contribute" class="contribute-dialog" aria-labelledby="contribute-title" aria-describedby="contribute-intro">
    <div class="contribute-dialog-head">
      <div><p class="section-kicker">SHARE WITH THE COMMUNITY</p><h2 id="contribute-title">Choose how to contribute</h2></div>
      <button class="contribute-dialog-close" type="button" data-contribute-close aria-label="Close contribution choices"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </div>
    <p id="contribute-intro" class="contribute-dialog-intro">No coding needed. Choose a way to share a public code or help check an existing one.</p>
    <div class="contribute-dialog-body">
      <div class="contribute-dialog-options">
        <a class="contribute-option contribute-option-telegram" href="${telegram}" target="_blank" rel="noopener noreferrer">
          <i class="fa-brands fa-telegram" aria-hidden="true"></i>
          <span><strong>Telegram <small>Mobile-friendly</small></strong><span>Open the Muse Invite Hub bot directly to submit a public code or report feedback. No GitHub sign-in.</span><em>Open Telegram</em></span>
          <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </a>
        <a class="contribute-option" href="${github}" target="_blank" rel="noopener noreferrer">
          <i class="fa-brands fa-github" aria-hidden="true"></i>
          <span><strong>GitHub form</strong><span>Share your own public code or a public Threads, X or Facebook source. GitHub sign-in required.</span><em>Open form</em></span>
          <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </a>
        <a class="contribute-option" data-contribute-feedback href="${prefix}#codes">
          <i class="fa-regular fa-comment-dots" aria-hidden="true"></i>
          <span><strong>Give code feedback</strong><span>Choose a listed code; posting on its GitHub Issue requires sign-in, or use the Telegram bot.</span><em>Find a code</em></span>
          <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        </a>
      </div>
      <div class="contribute-dialog-qr">
        <img src="${prefix}assets/contribute-qr.svg" width="154" height="154" alt="QR code to open the contribution choices on muse.eplus.dev" loading="lazy">
        <strong>Scan with your phone</strong>
        <p>Opens this choice menu on your phone. Select Telegram to chat with our bot.</p>
      </div>
    </div>
    <p class="contribute-dialog-safety"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Telegram requires your consent before publishing your public @username. Submissions require review; invite code validity is not guaranteed.</p>
  </dialog>`;
}
