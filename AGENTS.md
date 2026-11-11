# AGENTS.md — Muse Invite Hub

Static website: HTML, CSS, JavaScript, JSON and GitHub Actions. No npm dependencies or backend required.

## Rules

- Never invent invite codes, redemptions, reward amounts, account eligibility or live validity.
- The site owner confirms ownership of the featured `DPNIHH` code. Label it **Verified Owner** via `ownerConfirmed: true`. This is an ownership assertion, not independently verified Muse redemption. Keep `status: unverified` until an actual Muse redemption result is available.
- Keep at most one `featured: true` code. Pin it ahead of community codes regardless of sort selection.
- Treat code statuses as community-reported, potentially outdated.
- External public codes require attributable source URLs; never imply upstream endorsement.
- Self-reported usage limits are snapshots. You MAY display dated **reported remaining = reportedCapacity − reportedUses** if both counts and the report date are present, clearly labeled **Not live**. Never guess capacity/usage or call it live available slots. If absent, display **Not reported**.
- Never automatically publish user-submitted GitHub Issue content. Review and deduplicate before modifying data/invites.json.
- Never request, store or publish passwords, OTPs, access tokens, private login links, cookies or personal data.
- Render untrusted data using textContent only; never inject raw HTML or execute user submissions.
- Never claim affiliation with or endorsement by Meta or Muse.
- Preserve existing SEO titles, descriptions, URLs and other content unless explicitly requested.
- Main is production. Work through independent branches and PRs. Never force-push or stack PRs.
- Keep relative asset paths so GitHub Pages works with project subpaths and custom domains.
- Generate detail pages via trusted scripts/site-pages.mjs from validated catalog JSON. Never claim Muse officially validated community codes.
- Only owner-confirmed featured detail pages are indexable and appear in sitemap; unverified community details are noindex,follow and preview details noindex,nofollow,noarchive.
- Keep homepage title, description and canonical unchanged. Pre-render detail content, escape untrusted notes and usernames, and use WebPage/BreadcrumbList JSON-LD on detail.
- Directory Load more must preserve filtering and sorting, reset limit on changes, and work without adding query-string pagination or duplicate SEO pages.
- Treat PR preview inputs as untrusted data: copy approved static assets from the PR merge ref, but NEVER run PR scripts in a privileged publish workflow.
- Production must be copied from trusted main on every Pages publish. Rebuild all eligible open PR preview directories together; no stale/closed PR directories.
- Previews require green CI at the current PR head SHA and a safe merge ref. Mark generated preview HTML noindex, remove production canonical, add PR-scoped base path and preview-meta.json, and verify live HTML/CSS/JS/catalog before posting a preview link.
- Avoid personal deployment tokens, hourly preview schedules, and unverified/guessed URLs.

## Checks

- node scripts/validate.mjs
- node --test scripts/validate.test.mjs scripts/preview.test.mjs
- node --check assets/app.js
- Verify desktop/mobile, filters/search/sort, copy, empty and network-error states.

Copying a code is not the same as redeeming it.
