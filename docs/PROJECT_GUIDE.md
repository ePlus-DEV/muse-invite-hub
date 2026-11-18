# Project guide — Muse Invite Hub

This is the technical reference for maintainers. For a short project overview see the [README](../README.md); for Issue Forms, contribution rules and pull requests see [CONTRIBUTING.md](../CONTRIBUTING.md). Security and coding-agent policies live in [SECURITY.md](../SECURITY.md) and [AGENTS.md](../AGENTS.md).

## Run locally

Muse Invite Hub is a static HTML, CSS, JavaScript and JSON website, requiring no backend or npm installation. From the repository root:

~~~sh
node scripts/serve.mjs
~~~

Open http://localhost:8000/. Use HTTP rather than a local file URL because the homepage fetches the JSON catalog. The server uses Node.js built-ins only; to serve an extracted preview bundle instead, use `node scripts/serve.mjs /path/to/preview 8000`. Source checkouts render the homepage directly; code detail pages are generated in the Pages build.

Use **Node.js 24** for CI-compatible checks:

~~~sh
node scripts/validate.mjs
node scripts/audit-links.mjs
node --test scripts/serve.test.mjs
node --test scripts/validate.test.mjs scripts/audit-links.test.mjs scripts/preview.test.mjs scripts/preview-fallback.test.mjs scripts/site-pages.test.mjs scripts/seo-aeo.test.mjs
node --check assets/app.js
node --check assets/detail.js
node --check scripts/issue-to-pr.mjs
node --test scripts/issue-to-pr.test.mjs scripts/auto-merge.test.mjs scripts/close-accepted-issues.test.mjs scripts/close-published-comment-counts.test.mjs
~~~

For a complete generated site before merging, download the muse-invite-hub-pr-preview-N artifact from the PR Validate workflow, extract it and serve that folder over HTTP. Detail pages will be at /codes/CODE/. Test mobile/desktop, search, filtering, sort, copy, empty and network-error states, and feedback links.

## Catalog provenance and availability

The published catalog is [data/invites.json](../data/invites.json). Codes are unique across every source platform.

- GitHub entries use the submittedBy field. This identifies a GitHub account only.
- Public Threads, X (Twitter), Facebook and consented Telegram entries use validated HTTPS sourceUrl links instead of GitHub owner fields. Example original-post formats: https://www.threads.com/@handle/post/ID, https://x.com/handle/status/123456789 and https://www.facebook.com/handle/posts/ID.
- Telegram community submissions require a real public @username from a private Telegram bot update, explicit consent to publish the handle/profile and a human source/permission review. After review a Telegram listing may use `sourceUrl: "https://t.me/username"` (profile link, not proof of ownership) without GitHub `submittedBy` or `submittedById`. Numeric Telegram IDs never enter public records.
- The UI derives the source platform and handle from those public URLs. Automated Issue submissions require original post links; profiles, ambiguous sources and Facebook share-shortlinks need manual review. A GitHub reporter is not automatically the owner of a social account with the same handle.
- Codes carry community statuses such as unverified, reported-working and reported-not-working. These are not official Muse validation. Threads demo codes 18I70N and XZ4PV6 were user-supplied; their profile links alone do not independently prove the code was posted or works.

Muse's invite entry UI has six character slots. All new catalog, Issue and Telegram invite codes must contain exactly six ASCII letters or digits and be stored uppercase (`^[A-Z0-9]{6}$`, no hyphens). Text submissions may normalize lowercase to uppercase. This checks code syntax only, not redemption or invite availability.

Usage figures are **dated self-reported snapshots**, not live balances. Project policy limits each code to **at most 30 reported invite slots** (total 1–30, used/remaining 0–30). This is an upper bound, never a default or guarantee of remaining invites. The simplified web, Share Code and legacy Update Count forms ask only for Remaining (0–30). For a verified GitHub owner with a previously reviewed complete dated total, the system calculates used = that historical total − newly reported remaining. If no actual total was reviewed, used remains unknown; 30 is never assumed as an individual starting quota. Legacy three-count comments stay compatible. When capacity and used count are known, remaining = capacity - used. A remaining-only report is also allowed without guessing a total. The original 11 November 2026 [Issue #14](https://github.com/ePlus-DEV/muse-invite-hub/issues/14) submission reported **3 of 30 remaining**. A newer owner-confirmed comment on 15 November 2026 was reviewed in [PR #157](https://github.com/ePlus-DEV/muse-invite-hub/pull/157), updating the published snapshot to **23 remaining out of 30** (**7 used**). These are historical self-reports, not Muse live availability or independently validated redemption.

## Issue automation, conditional merge and acceptance

See the [visual contribution flow](CONTRIBUTION_FLOW.md) for the new-code auto-publication route, human-review routes and canonical Issue closure semantics.

- **New GitHub-owned code:** the historically named [Issue-to-Draft-PR workflow](../.github/workflows/issue-to-pr.yml) runs trusted code on `main` and can create a **Ready PR** when an open, consent-confirmed Issue contains 1–10 distinct *new* `GitHub (my own code)` submissions. Each code gets a standalone `data/invite-records/<id>.json` file. Auto-publication is restricted to new records with `status: unverified`, never an assertion that Muse validated the code or capacity.
- **Independent merge validation:** [Conditional PR auto-merge](../.github/workflows/auto-merge.yml) loads its implementation from trusted `main`, verifies the originating Issue and bot-authored PR provenance, compares **all** added record files to the exact deterministic proposal generated against current catalog data, blocks duplicates/changed source/extra paths, then requires current-head CI, current `main`, GitHub clean mergeability and no blocker. It squash-merges and dispatches the Pages workflow explicitly after a `GITHUB_TOKEN` merge.
- **Manual cases:** new Threads/X/Facebook codes, existing-code owner quota/feedback updates, source mismatches, malformed submissions, ownership disputes and duplicate codes stay in review-only Draft PRs or manual triage. Missing checkboxes mean the **original Issue remains open**, with a bot comment showing how to edit it—never auto-check permissions or close the contributor's submission.
- **Other PRs:** docs-only Ready PRs by @hoangsvit (README, CONTRIBUTING or Markdown under docs/, up to 15 files, no renames/deletions) can auto-merge after CI; all code, workflow, UI, config and mixed PRs require explicit @hoangsvit approval of the current head or `/automerge FULL_SHA`. Draft, `do-not-merge`, `/automerge off`, active review objections, stale main, conflicts or incomplete CI prevent merging.
- **Existing code discussion:** the directory links feedback to one canonical Issue per published code using `data/code-issues.json`. Contributor Issues are reused; threads for manually added codes are created once by the trusted Pages build. Human structured comments can reopen canonical Issues and propose **review-only Draft PRs**; they never directly change published status or count. Historical standalone count/feedback forms remain a fallback.
- **Production acceptance:** only trusted `main` is deployed. After the merge is included in a successful Pages deployment and the live detail endpoint works, `scripts/close-accepted-issues.mjs` posts the canonical `https://muse.eplus.dev/codes/CODE/` link and **then** closes the original new-code or legacy-report Issue. The separate `scripts/close-published-comment-counts.mjs` handles **merged owner-count PRs originating from canonical Issue comments** only after checking exact comment/owner identity, source PR, merged record, deployed SHA, live quota JSON and newer human comments. It posts a distinct completion note before closing; feedback-only or unresolved discussions stay open and newer reports can reopen a closed canonical Issue. A failed deploy, missing page or failed completion comment leaves it open.

The Issue bot explicitly dispatches validation because PRs created using `GITHUB_TOKEN` may not trigger normal PR checks. The merge workflow similarly dispatches Pages on its own token-initiated merges. Neither workflow executes unmerged PR source code with write permissions.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for user-facing steps and [AGENTS.md](../AGENTS.md) for the non-negotiable publishing policy.

## Previews and GitHub Pages deployment

Production is built from trusted main using [GitHub Actions](../.github/workflows/pages.yml). Unmerged PR scripts are not executed in privileged deployment workflows. Eligible same-repository PRs with passing validation can get hosted previews under https://muse.eplus.dev/pr-preview/pr-N/ and downloadable offline artifacts. Draft and fork PRs have restrictions; only use verified preview links issued by the workflow.

Preview pages use noindex,nofollow,noarchive and never appear in the sitemap. Deleted PR preview URLs can fall back through the custom 404.html to Home or the corresponding published detail. That is a client-side redirect, not a server-side HTTP 301/302.

Configure Settings → Pages → Source: GitHub Actions, with custom domain muse.eplus.dev. The [CNAME](../CNAME) file records the domain. In the eplus.dev DNS zone, muse is a CNAME to eplus-dev.github.io (no URL path). Set the Pages custom domain before DNS changes and enforce HTTPS once the certificate is ready. DNS settings are managed outside the repository.

## SEO and country availability

The homepage preserves its canonical URL, WebSite structured data, Open Graph metadata and GA4. Generated detail pages have their own canonical URL and WebPage/BreadcrumbList data. The trusted Pages build generates sitemap.xml from **all published entries in data/invites.json**, regardless of platform, featured status or verification. Code details are index,follow; previews stay noindex. Indexing never guarantees redemption, invite availability or rewards.

[llms.txt](../llms.txt) is curated public navigation, not a live validity feed or guaranteed search-indexing mechanism. Preserve factual, visible SEO content and avoid speculative claims.

The [country availability section](https://muse.eplus.dev/#availability) is dated, not a live eligibility check. As rechecked 18 November 2026, Meta had announced the United States, Canada, Japan, Singapore, Mexico and Australia. Vietnam was not among those confirmed markets, and an invite cannot override regional restrictions. Primary sources: [US](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [Canada](https://about.fb.com/news/2026/09/introducing-muse-small-business/), [Japan](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/), [Singapore](https://about.fb.com/news/2026/10/muse-is-now-available-in-singapore-the-worlds-first-personal-ai-agent-built-for-everyone/), [Mexico](https://about.fb.com/ltam/news/2026/09/presentamos-muse-el-primer-agente-de-ia-personal-del-mundo-creado-para-todos/), [Australia](https://about.fb.com/news/2026/11/muse-is-now-available-in-australia/). Canada is labeled "confirmed by 29 September", not assigned an invented specific rollout date. Australia was confirmed by Meta on 17 November 2026 as the sixth market. UK timing remains press-reported and not an official announcement; there is no verified Meta launch for Vietnam. Australian local connector features may roll out progressively. Update links, checked date and SEO tests together when a new market is confirmed.

## Project layout

| Path | Purpose |
| --- | --- |
| index.html, assets/ | Homepage, controls, styles, images and detail assets |
| data/invites.json, data/invite-records/ | Trusted legacy seed and independent per-code records assembled into one public catalog |
| scripts/validate.mjs, scripts/audit-links.mjs | Data and link validation |
| scripts/site-pages.mjs | Generated detail pages and sitemap |
| scripts/preview-core.mjs, scripts/build-pages.mjs | Preview and production site assembly |
| scripts/issue-to-pr.mjs, scripts/auto-merge.mjs, scripts/close-accepted-issues.mjs | Conditional Issue PR creation, trusted merge gate and post-deploy acceptance |
| .github/ISSUE_TEMPLATE/, .github/workflows/ | Issue Forms, CI and Pages deployment |

Preserve contributor attribution and project independence from Muse/Meta. See [AGENTS.md](../AGENTS.md) for non-negotiable safety and SEO policies.
