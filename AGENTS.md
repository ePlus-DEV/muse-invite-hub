# AGENTS.md — Muse Invite Hub

Static website: HTML, CSS, JavaScript, JSON and GitHub Actions. The local HTTP server is pure Node.js 24 with no npm dependencies or Python; production needs no backend.

## Rules

- Never invent invite codes, redemptions, reward amounts, account eligibility or live validity.
- The site owner confirms ownership of the featured `DPNIHH` code. Label it **Verified Owner** prominently via `ownerConfirmed: true` on both card and detail. Keep **Code owner** verification separate from **Muse redemption** status; do not show bare `Unverified` text that suggests owner verification is missing. This is an ownership assertion, not independently verified Muse redemption. Keep `status: unverified` until an actual Muse redemption result is available.
- Keep at most one `featured: true` code. Pin it ahead of community codes regardless of sort selection.
- Treat code statuses as community-reported, potentially outdated.
- Preserve attributed contributor handles for historical public code listings; do not imply contributors submitted directly to this site or that Muse validated a code.
- Do not mention, promote or link unrelated GitHub repositories in website content, catalogs, README, forms or generated artifacts. Do not add external repo URLs to sourceUrl. Preserve historical provenance in Git commit history.
- Self-reported usage limits are snapshots. You MAY display dated **reported remaining = reportedCapacity − reportedUses** with both counts, or dated `reportedRemaining` alone without any invented total. Always label **Not live**; if absent display **Not reported**. Never guess capacity, usage or availability.
- Public social invite reports from GitHub Issues must carry a validated original post `sourceUrl` for Threads, X (Twitter) or Facebook, preserving the platform-specific author derived from the URL, never the GitHub reporter. Profile-only, ambiguous/share-shortlink and invalid URLs require human triage; URLs do not establish ownership, redemption or live quota.
- GitHub Issue feedback and count update forms must select the existing listing's platform (GitHub, Threads, X, Facebook), and bot checks must reject source mismatches before applying changes. Same handle on different networks represents different identities. Preserve parsing of older Issues with no platform field.
- Never auto-update owner-only invite counts for Threads, X or Facebook entries from GitHub Issue identity alone. Cross-source duplicate codes always need manual attribution review.
- For an existing GitHub-owned invite code, allow a dated owner-submitted update from the same GitHub account, preserving catalog identity and original contributor. New owner reports require review-only Draft PRs. Different-owner duplicates need manual review. Prefer stable GitHub numeric user IDs for subsequent owner verification.
- Never automatically publish user-submitted GitHub Issue content. The trusted Issue automation may propose a reviewed-only Draft PR changing data/invites.json, but must not merge, force-push or expose automated Draft content through public Pages previews. Validate and deduplicate before proposing changes.
- Automated contribution Issues remain open during Draft PR review and merge; do not use GitHub auto-close keywords on Issue-to-PR proposals. After a successful trusted Pages deployment, verify the bot-authored PR merge is contained in the deployed commit, the Issue code exists in the validated production catalog and the live detail URL responds correctly. **Post one acceptance comment containing the canonical code detail link, then close the original Issue.** Never close if commenting or live verification fails; reruns must be idempotent. Acceptance is not proof of Muse redemption.
- Never request, store or publish passwords, OTPs, access tokens, private login links, cookies or personal data.
- Render untrusted data using textContent only; never inject raw HTML or execute user submissions.
- Never claim affiliation with or endorsement by Meta or Muse.
- Preserve existing SEO titles, descriptions, URLs and other content unless explicitly requested.
- Main is production. Work through independent branches and PRs. Never force-push or stack PRs.
- Keep relative asset paths so GitHub Pages works with project subpaths and custom domains.
- Use assets/favicon.svg as the single brand logo asset for homepage and generated detail headers/footers. Keep mobile sizing and preview-relative paths consistent. Use identical navigation and footer elements across pages.
- About links on the homepage and detail pages must expand the shared disclosure on `#about` navigation, including initial deep links while skeleton loading. Keep footer brand and navigation on one aligned row with mobile stacking and retain an accessible Back to top control on both page types.
- Generate detail pages via trusted scripts/site-pages.mjs from validated catalog JSON. Never claim Muse officially validated community codes.
- Every published, validated invite code has a canonical index,follow production detail and appears once in the generated production sitemap, regardless of platform, featured status or redemption verification. PR previews remain noindex,nofollow,noarchive. Indexability does not claim that Muse has validated a code.
- Keep homepage title, description and canonical unchanged. Pre-render detail content, escape untrusted notes and usernames, and use WebPage/BreadcrumbList JSON-LD on detail.
- Directory Load more must preserve filtering and sorting, reset limit on changes, and work without adding query-string pagination or duplicate SEO pages.
- Saved codes are local-only browser bookmarks with no account, analytics claim, or server state. Handle localStorage failures and cross-tab changes; never equate a saved or copied code with redemption.
- Recently updated sort uses only dated catalog activity (addedAt, usageReportedAt, checkedAt), not a fabricated live Muse check; keep featured pinned and newest as the default.
- Quick feedback and Give feedback from the website must link to ONE canonical GitHub Issue per published code (the original local contributor Issue when available); do not open duplicate feedback Issue Forms.
- New codes still use the Share Code Issue Form → review-only Draft PR → merge/deploy. Existing-code feedback and verified GitHub-owner quota changes must reuse the original code Issue via an editable comment dialog; a human-submitted structured comment may propose a new independent Draft PR, never direct catalog updates or auto-merge. Count updates must not spawn duplicate Issues; retain legacy forms only for backward compatibility. Community reports never imply Muse verification. Missing threads for manually added codes are created only by trusted production Pages build, never by public PR preview. GitHub does not offer prefilled comments by URL; user must submit a GitHub comment. New human comments on a canonical closed code thread trigger trusted reopening, never an automatic Muse verification or catalog update. Acceptance reconciler must not auto-close reopened feedback Issues. Separate code attribution and source permissions as before.
- Full-page skeletons are decorative and must mirror homepage/detail layout without replacing SEO content. Never trap users in loading state: release on successful data load, error/timeout, and allow no-JavaScript content. Respect reduced-motion preferences.
- Treat PR preview inputs as untrusted data: copy approved static assets from the PR merge ref, but NEVER run PR scripts in a privileged publish workflow.
- Production must be copied from trusted main on every Pages publish. Rebuild all eligible open PR preview directories together; no stale/closed PR directories.
- The trusted Pages output must ship a root `404.html` for deleted PR preview routes: send removed preview Home to production Home and removed code details to the matching published production detail, or Home if the code was never published. Do not redirect unrelated 404s or construct external redirects. GitHub Pages' initial response remains a 404 until the client-side redirect.
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
- Keep `llms.txt` concise and truthful. Its links must resolve to real, stable, publicly approved locations. Every merged code detail is indexable, but this guide is curated, not an exhaustive directory; never claim community codes work in real time.
- Prioritize useful, visible content with direct answers to actual visitor questions. Statements about availability, limits, account eligibility and rewards must agree with the original public reports and official Muse terms; never speculate.
- Google AI Overviews and AI Mode do not require `llms.txt`, special AI schema, or keyword-stuffed AEO text. No SEO, AEO, or LLM file guarantees indexing, referrals or AI citations.
- Generate production `sitemap.xml` from the validated catalog during the trusted Pages build; do not commit a separate static sitemap that becomes stale after automated code additions. CI must verify Home and ALL merged codes appear exactly once; production code details use index,follow and previews remain noindex,nofollow,noarchive.
- Use WebSite structured data on the homepage and WebPage/BreadcrumbList structured data on details only when it matches user-visible facts. Do not add invented reviews, misleading affiliations, artificial FAQ rich-results, or unsupported `SearchAction` markup.
- The trusted Pages build must copy `llms.txt` into the public site. PR previews may copy only approved static files and must never execute PR-supplied scripts.
- Test with Node.js 24: `node --test scripts/seo-aeo.test.mjs`. After deploying to production, verify `https://muse.eplus.dev/llms.txt` returns the current guide (not a 404 or stale file).

## Muse country availability editorial rule

- Supported signup markets must be supported by primary Meta announcements, not reposts or speculative lists. Keep the "as of" date and primary sources together with the public list; do not infer a future launch date from marketing campaigns.
- Separate a confirmed service rollout from an individual account's eligibility, waitlist status, invite-code redemption, and regional restrictions. Do not claim a code bypasses signup restrictions.
- Keep the country section compact and accessible as semantic static HTML, with source links and mobile layout. Preserve homepage SEO metadata, GA4, existing invites data, `llms.txt` indexability, and noindex preview rules.
- Update `scripts/seo-aeo.test.mjs` and the README/llms.txt country references when the Meta-source-backed list changes.
