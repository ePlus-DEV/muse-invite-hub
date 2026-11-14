/**
 * Canonical navigation shared by home, country map and generated code details.
 * Static home/map headers are checked against this source in site-navigation.test.mjs.
 * Use relative URLs so GitHub Pages PR previews resolve links under their own base.
 */
export function renderSiteHeader({prefix = "./", current = "home"} = {}) {
  if (!["./", "../", "../../"].includes(prefix) ||
      !["home", "countries", "detail"].includes(current)) {
    throw Error("Unexpected navigation context");
  }
  const home = prefix;
  const countries = current === "countries" ? "./" : prefix + "countries/";
  const share = "https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml";
  const active = page => current === page ? ' aria-current="page"' : "";
  const navLink = (href, page, icon, label) =>
    `        <a href="${href}"${active(page)}><i class="${icon}" aria-hidden="true"></i> ${label}</a>`;
  return `  <header class="site-header">
    <div class="container nav-shell">
      <a class="brand" href="${home}" aria-label="Muse Invite Hub homepage">
        <span class="brand-icon" aria-hidden="true"><img src="${prefix}assets/favicon.svg" width="42" height="42" alt=""></span>
        <span class="brand-type"><strong>Muse Invite Hub</strong><small>COMMUNITY</small></span>
      </a>
      <nav class="nav-links" id="site-nav" aria-label="Main navigation">
${navLink(home, "home", "fa-solid fa-house", "Home")}
${navLink(countries, "countries", "fa-solid fa-earth-americas", "Country map")}
${navLink(current === "home" ? "#about" : prefix + "#about", "about", "fa-regular fa-circle-question", "About")}
        <a href="https://github.com/ePlus-DEV/muse-invite-hub" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github" aria-hidden="true"></i> GitHub</a>
        <a class="nav-mobile-share" href="${share}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-plus" aria-hidden="true"></i> Share code</a>
      </nav>
      <a class="button button-primary nav-share" href="${share}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-plus" aria-hidden="true"></i> Share code</a>
      <button class="nav-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="site-nav"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
    </div>
  </header>`;
}
