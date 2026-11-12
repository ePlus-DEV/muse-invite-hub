import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateCatalog } from "./validate.mjs";
import { parsePublicSource } from "./source-platform.mjs";
import { renderPageSkeleton } from "./page-skeleton.mjs";

export const SITE_ORIGIN = "https://muse.eplus.dev";
export const DETAIL_PATH = "codes";
export const PAGE_SIZE = 12;

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
export function codePath(code) {
  if (typeof code !== "string" || !/^[A-Z0-9-]{4,32}$/.test(code)) {
    throw Error("Invalid public invite code path");
  }
  return "/codes/" + encodeURIComponent(code) + "/";
}
export function canIndexDetail(item) {
  // Index every valid, published invite detail page without implying redemption.
  // Only validated catalog entries reach the production detail generator.
  return typeof item?.code === "string" && /^[A-Z0-9-]{4,32}$/.test(item.code);
}
function dateText(value) {
  if (!value) return "Not reported";
  return new Date(value + "T00:00:00Z").toLocaleDateString("en-US",
    { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function jsonLd(data) {
  // Prevent a contributor-supplied string from closing its script element.
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}
function reportedSlots(item) {
  const { reportedCapacity: capacity, reportedUses: used, reportedRemaining: remaining, usageReportedAt: at } = item;
  if (!at) return null;
  if (Number.isInteger(remaining) && remaining >= 0) {
    return { remaining, capacity: null, date: dateText(at) };
  }
  if (!Number.isInteger(capacity) || capacity < 1 ||
      !Number.isInteger(used) || used < 0 || used > capacity) return null;
  return { remaining: capacity - used, capacity, date: dateText(at) };
}
function detailDescription(item) {
  const owner = item.ownerConfirmed ? "The site owner confirms ownership of this code." :
    "Community-shared listing; redemption has not been verified.";
  const quota = reportedSlots(item);
  const slots = quota
    ? " " + quota.remaining + (quota.capacity === null ? " invites remained (total not provided)" : " of " + quota.capacity + " invites remained") + " in a report dated " + quota.date + " (not live)."
    : " Remaining invite availability has not been reported.";
  return "Explore Muse invite code " + item.code + ". " + owner + slots;
}
function detailHtml(item, { origin = SITE_ORIGIN, basePath = "/", preview = false } = {}) {
  const root = origin.replace(/\/+$/, "");
  const base = basePath.endsWith("/") ? basePath : basePath + "/";
  if (!/^\/(?:pr-preview\/pr-[0-9]+\/)?$/.test(base)) throw Error("Unsafe detail basePath");
  const path = codePath(item.code);
  const pageUrl = root + base.slice(0, -1) + path;
  const title = item.code + " Muse Invite Code | Muse Invite Hub";
  const description = detailDescription(item);
  const hasIndex = canIndexDetail(item) && !preview;
  const status = item.ownerConfirmed ? "Verified Owner" :
    item.status === "reported-working" ? "Reported working (community)" :
    item.status === "reported-not-working" ? "Reported not working" : "Unverified";
  const quota = reportedSlots(item);
  const usage = quota
    ? '<strong class="detail-slots-number">' + escapeHtml(quota.remaining) +
      (quota.capacity === null ? '' : ' / ' + escapeHtml(quota.capacity)) + '</strong><span class="detail-slots-caption">invites remaining, reported ' +
      escapeHtml(quota.date) + ' · Not live</span>'
    : '<strong class="detail-slots-number">Not reported</strong><span class="detail-slots-caption">No confirmed remaining-slot data</span>';
  const social = parsePublicSource(item.sourceUrl);
  const platform = social?.platform || "GitHub";
  const handle = social?.handle || item.submittedBy;
  const author = handle ? "@" + handle : "Community contributor";
  const sourceUrl = social?.url || (handle ? "https://github.com/" + encodeURIComponent(handle) : null);
  const sourceLink = sourceUrl
    ? '<a href="' + escapeHtml(sourceUrl) + '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(platform + " · " + author) + ' <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>'
    : escapeHtml(platform);
  const feedbackUrl = new URL("https://github.com/ePlus-DEV/muse-invite-hub/issues/new");
  feedbackUrl.searchParams.set("template", "report-code.yml");
  feedbackUrl.searchParams.set("invite_code", item.code);
  feedbackUrl.searchParams.set("title", "[Code feedback] " + item.code);
  const ownerText = item.ownerConfirmed
    ? 'Owner-confirmed by ePlus.DEV. Ownership confirmation does not mean the code has been redeemed or validated by Muse.'
    : 'This community listing has not been independently tested. Its appearance here does not guarantee Muse access.';
  const notes = item.note ? '<p class="detail-note">' + escapeHtml(item.note) + '</p>' : '';
  const redemptionLine = item.status === "reported-working" ?
    "Reported working (community; not Muse-verified)" :
    item.status === "reported-not-working" ?
    "Reported not working (community)" :
    "Not independently confirmed by Muse";
  const statusLine = item.ownerConfirmed ? 'Verified Owner' : 'Community listing';
  const graph = [
    { "@context": "https://schema.org", "@type": "WebPage", "@id": pageUrl + "#webpage",
      url: pageUrl, name: title, description, isPartOf: { "@type": "WebSite", name: "Muse Invite Hub", url: root + "/" },
      inLanguage: "en" },
    { "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Muse Invite Hub", item: root + "/" },
        { "@type": "ListItem", position: 2, name: "Invite codes", item: root + "/#codes" },
        { "@type": "ListItem", position: 3, name: item.code, item: pageUrl }
      ] }
  ];
  const meta = preview
    ? '<meta name="robots" content="noindex,nofollow,noarchive">'
    : hasIndex
      ? '<meta name="robots" content="index,follow"><link rel="canonical" href="' + escapeHtml(pageUrl) + '">'
      : '<meta name="robots" content="noindex,follow"><link rel="canonical" href="' + escapeHtml(pageUrl) + '">';
  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '  <meta name="theme-color" content="#f4f6f9">\n' +
    '  <script>document.documentElement.classList.add("is-page-loading");window.setTimeout(() => document.documentElement.classList.remove("is-page-loading"), 9000);document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.remove("is-page-loading"), { once: true });</script>\n' +
    '  <title>' + escapeHtml(title) + '</title>\n' +
    '  <meta name="description" content="' + escapeHtml(description) + '">\n' +
    '  ' + meta + '\n' +
    '  <meta property="og:type" content="website">\n' +
    '  <meta property="og:title" content="' + escapeHtml(title) + '">\n' +
    '  <meta property="og:description" content="' + escapeHtml(description) + '">\n' +
    '  <meta property="og:url" content="' + escapeHtml(pageUrl) + '">\n' +
    '  <meta property="og:image" content="' + root + base.slice(0, -1) + '/assets/social-preview.png?v=20261112">\n' +
    '  <meta name="twitter:card" content="summary_large_image">\n' +
    '  <link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">\n' +
    '  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">\n' +
    '  <link rel="stylesheet" href="../../assets/styles.css">\n' +
    '  <!-- Google tag (gtag.js) -->\n' +
    '  <script async src="https://www.googletagmanager.com/gtag/js?id=G-N1MZ8YLNLJ"></script>\n' +
    '  <script>window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag(\'js\', new Date());gtag(\'config\', \'G-N1MZ8YLNLJ\');</script>\n' +
    '  <script type="application/ld+json">' + jsonLd(graph) + '</script>\n' +
    '  <script src="../../assets/directory-features.js" defer></script>\n' +
    '  <script src="../../assets/site-ui.js" defer></script>\n' +
    '  <script src="../../assets/detail.js" defer></script>\n' +
    '</head>\n<body>\n' +
    '  <a class="skip-link" href="#detail-title">Skip to invite details</a>\n' +
    renderPageSkeleton("detail") + '\n' +
    '  <header class="site-header"><div class="container nav-shell">' +
    '    <a class="brand" href="../../" aria-label="Muse Invite Hub homepage"><span class="brand-icon" aria-hidden="true"><img src="../../assets/favicon.svg" width="42" height="42" alt=""></span>' +
    '      <span class="brand-type"><strong>Muse Invite Hub</strong><small>COMMUNITY</small></span></a>' +
    '    <nav class="nav-links" aria-label="Main navigation"><a href="../../">Home</a>' +
    '      <a href="../../#about">About</a>' +
    '      <a href="https://github.com/ePlus-DEV/muse-invite-hub" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github" aria-hidden="true"></i> GitHub</a></nav>' +
    '    <a class="button button-primary nav-share" href="https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-plus" aria-hidden="true"></i> Share code</a>' +
    '  </div></header>\n' +
    '  <main class="container detail-page">' +
    '    <nav class="detail-breadcrumb" aria-label="Breadcrumb"><a href="../../">Home</a><span aria-hidden="true">/</span>' +
    '      <a href="../../#codes">Invite codes</a><span aria-hidden="true">/</span><span aria-current="page">' + escapeHtml(item.code) + '</span></nav>' +
    '    <div class="detail-layout">' +
    '      <section class="detail-primary" aria-labelledby="detail-title">' +
    '        <p class="section-kicker">MUSE INVITE · ' + escapeHtml(statusLine.toUpperCase()) + '</p>' +
    '        <h1 id="detail-title">Invite code <span class="detail-code-text">' + escapeHtml(item.code) + '</span></h1>' +
    '        <p class="detail-lead">' + escapeHtml(description) + '</p>' +
    '        <div class="detail-code-panel">' +
    '          <div class="detail-code-heading"><span class="detail-status">' + (item.ownerConfirmed ? '<i class="fa-solid fa-check" aria-hidden="true"></i> ' : '') + escapeHtml(status) + '</span>' +
    '            <span class="detail-owner">' + escapeHtml(author) + '</span></div>' +
    '          <p class="detail-code" id="detail-code">' + escapeHtml(item.code) + '</p>' +
    '          <div class="detail-action-row"><button class="button button-primary" type="button" id="detail-copy"><i class="fa-regular fa-copy" aria-hidden="true"></i> <span class="detail-copy-label">Copy invite code</span></button>' +
    '            <button class="button button-outlined detail-save" id="detail-save" type="button" aria-pressed="false" hidden><i class="fa-regular fa-bookmark" aria-hidden="true"></i> <span class="detail-save-label">Save code</span></button>' +
    '            <a class="button button-outlined" href="https://muse.ai/join" target="_blank" rel="noopener noreferrer">Open Muse <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a></div>' +
    '          <p class="detail-caution">' + escapeHtml(ownerText) + '</p>' +
    '        </div>' + notes +
    '        <section class="detail-instructions" aria-labelledby="how-to-redeem"><h2 id="how-to-redeem">How to use this code</h2>' +
    '          <ol><li>Copy the invitation code shown above.</li>' +
    '          <li>Open Muse and look for its invite-code redemption option in Settings (the location can change).</li>' +
    '          <li>Enter the code and review eligibility and reward terms directly in Muse.</li></ol>' +
    '          <p>Only Muse confirms whether an invitation is accepted. Copying it on this site does not redeem it or reduce its remaining quota.</p>' +
    '        </section>' +
    '      </section>' +
    '      <aside class="detail-side" aria-label="Invite information">' +
    '        <div class="detail-info-card"><p class="section-kicker">REPORTED AVAILABILITY</p>' + usage +
    '          <p class="detail-caption">These figures are dated, owner-reported snapshots—not a real-time Muse balance.</p></div>' +
    '        <div class="detail-info-card"><p class="section-kicker">LISTING DETAILS</p>' +
    '          <dl class="detail-meta"><div><dt>Contributor</dt><dd>' + escapeHtml(author) + '</dd></div>' +
    '            <div><dt>Source</dt><dd>' + sourceLink + '</dd></div>' +
    '            <div><dt>Listed</dt><dd>' + escapeHtml(dateText(item.addedAt)) + '</dd></div>' +
    (item.ownerConfirmed ? '            <div><dt>Code owner</dt><dd><span class="detail-owner-confirmed"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Verified Owner (ePlus.DEV)</span></dd></div>' : '') +
    '            <div><dt>Muse redemption</dt><dd>' + escapeHtml(redemptionLine) + '</dd></div></dl>' +
    '        </div><div class="detail-info-card detail-feedback"><h2>Does this code work?</h2><p>Share your experience to help the community keep listings accurate.</p>' +
    '          <a href="' + escapeHtml(feedbackUrl.href) + '" target="_blank" rel="noopener noreferrer"><i class="fa-regular fa-comment" aria-hidden="true"></i> Give feedback</a>' +
    '          <div class="detail-feedback-actions"><a class="detail-quick-feedback" data-feedback-outcome="worked" href="' + escapeHtml(feedbackUrl.href) + '" target="_blank" rel="noopener noreferrer"><i class="fa-regular fa-thumbs-up" aria-hidden="true"></i> Worked for me</a>' +
    '            <a class="detail-quick-feedback" data-feedback-outcome="failed" href="' + escapeHtml(feedbackUrl.href) + '" target="_blank" rel="noopener noreferrer"><i class="fa-regular fa-thumbs-down" aria-hidden="true"></i> Didn\'t work</a></div></div>' +
    '      </aside>' +
    '    </div><a class="detail-back" href="../../#codes"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to all invite codes</a>' +
    '    <p class="detail-independent">Muse Invite Hub is independent and not affiliated with Muse or Meta.</p>' +
    '    <p id="detail-live" class="sr-only" role="status" aria-live="polite"></p>' +
    '  </main>\n' +
    '  <footer class="site-footer"><div class="container footer-inner">' +
    '    <div class="footer-main-row">' +
    '      <a class="footer-brand" href="../../"><span class="brand-icon brand-icon-small" aria-hidden="true"><img src="../../assets/favicon.svg" width="30" height="30" alt=""></span> Muse Invite Hub</a>' +
    '      <nav class="footer-links" aria-label="Footer navigation">' +
    '        <a href="https://muse.ai/" target="_blank" rel="noopener noreferrer">Official Muse <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>' +
    '        <a href="https://github.com/ePlus-DEV/muse-invite-hub" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github" aria-hidden="true"></i> GitHub</a>' +
    '        <a href="https://github.com/ePlus-DEV/muse-invite-hub/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">Contribute <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>' +
    '      </nav></div><p class="footer-tagline">Small gestures. Bigger possibilities.</p></div>' +
    '    <div class="container footer-bottom"><span>© 2026 ePlus.DEV · Open source, community driven.</span>' +
    '      <span>Independent project · Not affiliated with Meta or Muse.</span></div></footer>' +
    '  <button class="back-to-top" id="back-to-top" type="button" aria-label="Back to top" title="Back to top" hidden><i class="fa-solid fa-arrow-up" aria-hidden="true"></i><span>Top</span></button>' +
    '\n</body>\n</html>\n';
}
export function renderDetailPage(item, options) {
  if (!item || !/^[A-Z0-9-]{4,32}$/.test(item.code || "")) throw Error("Invalid detail entry");
  return detailHtml(item, options);
}
export function generateSitemap(items, origin = SITE_ORIGIN) {
  const base = origin.replace(/\/+$/, "");
  const paths = ["/", ...items.filter(canIndexDetail).map(item => codePath(item.code))];
  const rows = paths.map(path => "  <url><loc>" + escapeHtml(base + path) + "</loc></url>").join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + rows + '\n</urlset>\n';
}
export function generateSite(root, { origin = SITE_ORIGIN, basePath = "/", preview = false } = {}) {
  const items = JSON.parse(readFileSync(join(root, "data/invites.json"), "utf8"));
  const errors = validateCatalog(items);
  if (errors.length) throw Error("Invalid catalog for static pages: " + errors.join("; "));
  let created = 0;
  for (const item of items) {
    const folder = join(root, DETAIL_PATH, item.code);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "index.html"), renderDetailPage(item, { origin, basePath, preview }));
    created++;
  }
  // Previews are never indexed; production sitemap includes every published code.
  if (!preview) writeFileSync(join(root, "sitemap.xml"), generateSitemap(items, origin));
  return { created, indexed: items.filter(canIndexDetail).length };
}
