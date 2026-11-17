/* Shared navigation and accessibility enhancements for all site pages. */
(() => {
  "use strict";

  function initialize() {
    const about = document.getElementById("about");
    const aboutDisclosure = about?.querySelector("details.help-disclosure");
    const topButton = document.getElementById("back-to-top");
    const prefersReducedMotion = () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior = () => prefersReducedMotion() ? "auto" : "smooth";

    // All page types share the same header, links, and accessible mobile menu.
    // Keep static links usable when JavaScript is unavailable.
    const header = document.querySelector(".site-header");
    const nav = header?.querySelector(".nav-links");
    const toggle = header?.querySelector(".nav-toggle");
    if (header && nav && toggle) {
      const closeMenu = (focusToggle = false) => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation menu");
        if (focusToggle) toggle.focus();
      };
      toggle.addEventListener("click", () => {
        const opening = !nav.classList.contains("is-open");
        nav.classList.toggle("is-open", opening);
        toggle.setAttribute("aria-expanded", String(opening));
        toggle.setAttribute("aria-label", opening ? "Close navigation menu" : "Open navigation menu");
      });
      nav.addEventListener("click", event => {
        if (event.target.closest("a")) closeMenu();
      });
      document.addEventListener("pointerdown", event => {
        if (!header.contains(event.target)) closeMenu();
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape" && nav.classList.contains("is-open")) closeMenu(true);
      });
      window.addEventListener("resize", () => {
        if (window.innerWidth > 800) closeMenu();
      });
      header.classList.add("nav-enhanced");
    }


    // Preserve the new site UI. Trusted-main detail previews may lack the
    // static contribution dialog; create the same safe, static HTML there.
    const shareLinks = document.querySelectorAll?.("[data-contribute-trigger], .nav-share, .nav-mobile-share") || [];
    let shareDialog = document.getElementById("contribute");
    if (!shareDialog && shareLinks.length && document.createElement && document.body) {
      const path = window.location.pathname || "";
      const prefix = path.includes("/codes/") ? "../../" :
        path.includes("/countries/") ? "../" : "./";
      const github = "https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml";
      const guide = "https://github.com/ePlus-DEV/muse-invite-hub/blob/main/docs/TELEGRAM_BOT_GUIDE.md";
      const template = document.createElement("template");
      template.innerHTML = `  <dialog id="contribute" class="contribute-dialog" aria-labelledby="contribute-title" aria-describedby="contribute-intro">
    <div class="contribute-dialog-head">
      <div><p class="section-kicker">SHARE WITH THE COMMUNITY</p><h2 id="contribute-title">Choose how to contribute</h2></div>
      <button class="contribute-dialog-close" type="button" data-contribute-close aria-label="Close contribution choices"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </div>
    <p id="contribute-intro" class="contribute-dialog-intro">No coding needed. Choose a way to share a public code or help check an existing one.</p>
    <div class="contribute-dialog-body">
      <div class="contribute-dialog-options">
        <a class="contribute-option contribute-option-telegram" href="${guide}" target="_blank" rel="noopener noreferrer">
          <i class="fa-brands fa-telegram" aria-hidden="true"></i>
          <span><strong>Telegram <small>Mobile-friendly</small></strong><span>Use an existing trusted bot chat to submit or report a code; no GitHub account needed.</span><em>View Telegram guide</em></span>
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
        <p>Opens this same choice menu. QR does not open an unverified Telegram account.</p>
      </div>
    </div>
    <p class="contribute-dialog-safety"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Telegram needs consent to publish your public @username. Submissions require review; code validity is not guaranteed. A verified public bot link has not yet been published.</p>
  </dialog>`;
      shareDialog = template.content?.firstElementChild || null;
      if (shareDialog) document.body.append(shareDialog);
    }
    if (shareDialog && typeof shareDialog.showModal === "function") {
      const openShare = () => { if (!shareDialog.open) shareDialog.showModal(); };
      shareLinks.forEach(link => link.addEventListener("click", event => {
        event.preventDefault();
        openShare();
      }));
      shareDialog.querySelector("[data-contribute-close]")?.addEventListener("click", () => shareDialog.close());
      shareDialog.querySelector("[data-contribute-feedback]")?.addEventListener("click", () => shareDialog.close());
      shareDialog.addEventListener("click", event => {
        if (event.target === shareDialog) shareDialog.close();
      });
      const openSharedQr = () => { if (window.location.hash === "#contribute") openShare(); };
      window.addEventListener("hashchange", openSharedQr);
      openSharedQr();
    }

    // About is an actual disclosure. Opening its contents *before* scrolling
    // fixes both repeated clicks and deep links arriving from code detail pages.
    if (about && aboutDisclosure) {
      let loadingObserver = null;

      function revealAbout() {
        aboutDisclosure.open = true;
        if (document.documentElement.classList.contains("is-page-loading")) {
          if (!loadingObserver) {
            loadingObserver = new MutationObserver(() => {
              if (!document.documentElement.classList.contains("is-page-loading")) {
                loadingObserver.disconnect();
                loadingObserver = null;
                if (window.location.hash === "#about") revealAbout();
              }
            });
            loadingObserver.observe(document.documentElement, {
              attributes: true, attributeFilter: ["class"]
            });
          }
          return;
        }
        window.requestAnimationFrame(() => {
          if (window.location.hash === "#about") {
            about.scrollIntoView({ behavior: behavior(), block: "start" });
          }
        });
      }

      document.querySelectorAll('a[href="#about"]').forEach(link => {
        link.addEventListener("click", revealAbout);
      });
      window.addEventListener("hashchange", () => {
        if (window.location.hash === "#about") revealAbout();
      });
      if (window.location.hash === "#about") revealAbout();
    }

    if (topButton) {
      let footerVisible = false;
      const updateButton = () => {
        topButton.hidden = window.scrollY < 400 || footerVisible;
      };
      // Keep the floating button clear of the footer's navigation and legal text.
      const footer = document.querySelector(".site-footer");
      if (footer && typeof IntersectionObserver === "function") {
        const footerObserver = new IntersectionObserver(entries => {
          footerVisible = entries.some(entry => entry.isIntersecting);
          updateButton();
        }, { threshold: 0 });
        footerObserver.observe(footer);
      }
      let queued = false;
      window.addEventListener("scroll", () => {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(() => {
          queued = false;
          updateButton();
        });
      }, { passive: true });
      window.addEventListener("resize", updateButton, { passive: true });
      topButton.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: behavior() });
      });
      updateButton();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
