# AGENTS.md — Muse Invite Hub

Static website: HTML, CSS, JavaScript, JSON and GitHub Actions. No npm dependencies or backend required.

## Rules

- Never invent invite codes, redemptions, reward amounts, account eligibility or live validity.
- The site owner confirms ownership of the featured `DPNIHH` code. Label it **Verified Owner** via `ownerConfirmed: true`. This is an ownership assertion, not independently verified Muse redemption. Keep `status: unverified` until an actual Muse redemption result is available.
- Keep at most one `featured: true` code. Pin it ahead of community codes regardless of sort selection.
- Treat code statuses as community-reported, potentially outdated.
- Preserve attributed contributor handles for historical public code listings; do not imply contributors submitted directly to this site or that Muse validated a code.
- Do not mention, promote or link unrelated GitHub repositories in website content, catalogs, README, forms or generated artifacts. Do not add external repo URLs to sourceUrl. Preserve historical provenance in Git commit history.
- Self-reported usage limits are snapshots. You MAY display dated **reported remaining = reportedCapacity − reportedUses** with both counts, or dated `reportedRemaining` alone without any invented total. Always label **Not live**; if absent display **Not reported**. Never guess capacity, usage or availability.
- Public Threads invite reports from GitHub Issues must carry a valid original-post sourceUrl and preserve the Threads author derived from that URL, never the GitHub reporter. A profile-only source requires human triage; public URLs do not establish ownership, redemption or live quota.
- GitHub Issue feedback and count update forms must select the existing listing's platform, and bot checks must reject source mismatches before applying changes. Treat a matching GitHub/Threads @handle as different identities. Preserve parsing of older Issues with no platform field.
- Never auto-update owner-only invite counts for Threads-sourced entries from GitHub Issue identity alone. Cross-source duplicate codes always need manual attribution review.
- For an existing GitHub-owned invite code, allow a dated owner-submitted update from the same GitHub account, preserving catalog identity and original contributor. New owner reports require review-only Draft PRs. Different-owner duplicates need manual review. Prefer stable GitHub numeric user IDs for subsequent owner verification.
- Never automatically publish user-submitted GitHub Issue content. The trusted Issue automation may propose a reviewed-only Draft PR changing data/invites.json, but must not merge, force-push or expose automated Draft content through public Pages previews. Validate and deduplicate before proposing changes.
- Never request, store or publish passwords, OTPs, access tokens, private login links, cookies or personal data.
- Render untrusted data using textContent only; never inject raw HTML or execute user submissions.
- Never claim affiliation with or endorsement by Meta or Muse.
- Preserve existing SEO titles, descriptions, URLs and other content unless explicitly requested.
- Main is production. Work through independent branches and PRs. Never force-push or stack PRs.
- Keep relative asset paths so GitHub Pages works with project subpaths and custom domains.
- Use assets/favicon.svg as the single brand logo asset for homepage and generated detail headers/footers. Keep mobile sizing and preview-relative paths consistent. Use identical navigation and footer elements across pages.
- Generate detail pages via trusted scripts/site-pages.mjs from validated catalog JSON. Never claim Muse officially validated community codes.
- Only owner-confirmed featured detail pages are indexable and appear in sitemap; unverified community details are noindex,follow and preview details noindex,nofollow,noarchive.
- Keep homepage title, description and canonical unchanged. Pre-render detail content, escape untrusted notes and usernames, and use WebPage/BreadcrumbList JSON-LD on detail.
- Directory Load more must preserve filtering and sorting, reset limit on changes, and work without adding query-string pagination or duplicate SEO pages.
- Treat PR preview inputs as untrusted data: copy approved static assets from the PR merge ref, but NEVER run PR scripts in a privileged publish workflow.
- Production must be copied from trusted main on every Pages publish. Rebuild all eligible open PR preview directories together; no stale/closed PR directories.
- Previews require green CI at the current PR head SHA and a safe merge ref. Mark generated preview HTML noindex, remove production canonical, add PR-scoped base path and preview-meta.json; for PRs adding detail routes, verify both the nested directory URL and its index.html, plus CSS/JS, before posting a preview link.
- Verify the actual production detail directory URL, index.html, CSS, JS, image and sitemap after Pages deploy; never declare production healthy from build output alone.
- Avoid personal deployment tokens, hourly preview schedules, and unverified/guessed URLs.

## Checks

- node scripts/validate.mjs
- node --test scripts/validate.test.mjs scripts/preview.test.mjs
- node --check assets/app.js
- Verify desktop/mobile, filters/search/sort, copy, empty and network-error states.

Copying a code is not the same as redeeming it.

## AI agents, llms.txt, SEO and AEO

- `AGENTS.md` instructs coding agents. Public `llms.txt` is a curated Markdown navigation guide, not a crawler-permissions file, live invite feed, or Google ranking requirement.
- Never change homepage SEO title, meta description, canonical, Open Graph/Twitter metadata, or GA4 tag without express authorization. Do not edit SEO copy incidentally during layout or maintenance tasks.
- Keep `llms.txt` concise and truthful. Its links must resolve to real, stable, publicly approved locations. Do not advertise non-indexable community detail pages as search results or claim codes work in real time.
- Prioritize useful, visible content with direct answers to actual visitor questions. Statements about availability, limits, account eligibility and rewards must agree with the original public reports and official Muse terms; never speculate.
- Google AI Overviews and AI Mode do not require `llms.txt`, special AI schema, or keyword-stuffed AEO text. No SEO, AEO, or LLM file guarantees indexing, referrals or AI citations.
- Keep `robots.txt` and the production sitemap consistent. Preserve the current indexability rule: homepage and owner-confirmed featured detail only; community details `noindex,follow`; PR previews `noindex,nofollow,noarchive`.
- Use WebSite structured data on the homepage and WebPage/BreadcrumbList structured data on details only when it matches user-visible facts. Do not add invented reviews, misleading affiliations, artificial FAQ rich-results, or unsupported `SearchAction` markup.
- The trusted Pages build must copy `llms.txt` into the public site. PR previews may copy only approved static files and must never execute PR-supplied scripts.
- Test with Node.js 24: `node --test scripts/seo-aeo.test.mjs`. After deploying to production, verify `https://muse.eplus.dev/llms.txt` returns the current guide (not a 404 or stale file).

## Muse country availability editorial rule

- Supported signup markets must be supported by primary Meta announcements, not reposts or speculative lists. Keep the "as of" date and primary sources together with the public list; do not infer a future launch date from marketing campaigns.
- Separate a confirmed service rollout from an individual account's eligibility, waitlist status, invite-code redemption, and regional restrictions. Do not claim a code bypasses signup restrictions.
- Keep the country section compact and accessible as semantic static HTML, with source links and mobile layout. Preserve homepage SEO metadata, GA4, existing invites data, `llms.txt` indexability, and noindex preview rules.
- Update `scripts/seo-aeo.test.mjs` and the README/llms.txt country references when the Meta-source-backed list changes.
