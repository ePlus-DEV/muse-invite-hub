/* Shared, dependency-free navigation enhancements for the homepage and code details. */
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
      const updateButton = () => {
        topButton.hidden = window.scrollY < 400;
      };
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
