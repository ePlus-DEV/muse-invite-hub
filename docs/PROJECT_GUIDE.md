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
node --test scripts/issue-to-pr.test.mjs scripts/auto-merge.test.mjs scripts/close-accepted-issues.test.mjs
~~~

For a complete generated site before merging, download the muse-invite-hub-pr-preview-N artifact from the PR Validate workflow, extract it and serve that folder over HTTP. Detail pages will be at /codes/CODE/. Test mobile/desktop, search, filtering, sort, copy, empty and network-error states, and feedback links.

## Catalog provenance and availability

The published catalog is [data/invites.json](../data/invites.json). Codes are unique across every source platform.

- GitHub entries use the submittedBy field. This identifies a GitHub account only.
- Public Threads, X (Twitter) and Facebook entries use validated HTTPS sourceUrl links instead of GitHub owner fields. Example original-post formats: https://www.threads.com/@handle/post/ID, https://x.com/handle/status/123456789 and https://www.facebook.com/handle/posts/ID.
- The UI derives the source platform and handle from those public URLs. Automated Issue submissions require original post links; profiles, ambiguous sources and Facebook share-shortlinks need manual review. A GitHub reporter is not automatically the owner of a social account with the same handle.
- Codes carry community statuses such as unverified, reported-working and reported-not-working. These are not official Muse validation. Threads demo codes 18I70N and XZ4PV6 were user-supplied; their profile links alone do not independently prove the code was posted or works.

Usage figures are **dated self-reported snapshots**, not live balances. When capacity and used count are known, remaining = capacity - used. A remaining-only report is also allowed without guessing a total. The owner reported **3 of 30 remaining** for DPNIHH in [Issue #14](https://github.com/ePlus-DEV/muse-invite-hub/issues/14) on 2026-11-11. Owner confirmation proves ownership only; copying a code does not redeem it.

## Issue automation, conditional merge and acceptance

See the [visual contribution flow](CONTRIBUTION_FLOW.md) for the new-code auto-publication route, human-review routes and canonical Issue closure semantics.

- **New GitHub-owned code:** the historically named [Issue-to-Draft-PR workflow](../.github/workflows/issue-to-pr.yml) runs trusted code on `main` and can create a **Ready PR** when an open, consent-confirmed Issue contains 1–10 distinct *new* `GitHub (my own code)` submissions. Each code gets a standalone `data/invite-records/<id>.json` file. Auto-publication is restricted to new records with `status: unverified`, never an assertion that Muse validated the code or capacity.
- **Independent merge validation:** [Conditional PR auto-merge](../.github/workflows/auto-merge.yml) loads its implementation from trusted `main`, verifies the originating Issue and bot-authored PR provenance, compares **all** added record files to the exact deterministic proposal generated against current catalog data, blocks duplicates/changed source/extra paths, then requires current-head CI, current `main`, GitHub clean mergeability and no blocker. It squash-merges and dispatches the Pages workflow explicitly after a `GITHUB_TOKEN` merge.
- **Manual cases:** new Threads/X/Facebook codes, existing-code owner quota/feedback updates, source mismatches, malformed submissions, ownership disputes and duplicate codes stay in review-only Draft PRs or manual triage. Missing checkboxes mean the **original Issue remains open**, with a bot comment showing how to edit it—never auto-check permissions or close the contributor's submission.
- **Other PRs:** docs-only Ready PRs by @hoangsvit (README, CONTRIBUTING or Markdown under docs/, up to 15 files, no renames/deletions) can auto-merge after CI; all code, workflow, UI, config and mixed PRs require explicit @hoangsvit approval of the current head or `/automerge FULL_SHA`. Draft, `do-not-merge`, `/automerge off`, active review objections, stale main, conflicts or incomplete CI prevent merging.
- **Existing code discussion:** the directory links feedback to one canonical Issue per published code using `data/code-issues.json`. Contributor Issues are reused; threads for manually added codes are created once by the trusted Pages build. Human structured comments can reopen canonical Issues and propose **review-only Draft PRs**; they never directly change published status or count. Historical standalone count/feedback forms remain a fallback.
- **Production acceptance:** only trusted `main` is deployed. After the merge is included in a successful Pages deployment and the live detail endpoint works, `scripts/close-accepted-issues.mjs` posts the canonical `https://muse.eplus.dev/codes/CODE/` link and **then** closes the original new-code or legacy-report Issue. A failed deploy, missing page or failed acceptance comment leaves it open. Canonical Issues reopened for later feedback are not automatically reclosed.

The Issue bot explicitly dispatches validation because PRs created using `GITHUB_TOKEN` may not trigger normal PR checks. The merge workflow similarly dispatches Pages on its own token-initiated merges. Neither workflow executes unmerged PR source code with write permissions.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for user-facing steps and [AGENTS.md](../AGENTS.md) for the non-negotiable publishing policy.

## Previews and GitHub Pages deployment

Production is built from trusted main using [GitHub Actions](../.github/workflows/pages.yml). Unmerged PR scripts are not executed in privileged deployment workflows. Eligible same-repository PRs with passing validation can get hosted previews under https://muse.eplus.dev/pr-preview/pr-N/ and downloadable offline artifacts. Draft and fork PRs have restrictions; only use verified preview links issued by the workflow.

Preview pages use noindex,nofollow,noarchive and never appear in the sitemap. Deleted PR preview URLs can fall back through the custom 404.html to Home or the corresponding published detail. That is a client-side redirect, not a server-side HTTP 301/302.

Configure Settings → Pages → Source: GitHub Actions, with custom domain muse.eplus.dev. The [CNAME](../CNAME) file records the domain. In the eplus.dev DNS zone, muse is a CNAME to eplus-dev.github.io (no URL path). Set the Pages custom domain before DNS changes and enforce HTTPS once the certificate is ready. DNS settings are managed outside the repository.

## SEO and country availability

The homepage preserves its canonical URL, WebSite structured data, Open Graph metadata and GA4. Generated detail pages have their own canonical URL and WebPage/BreadcrumbList data. The trusted Pages build generates sitemap.xml from **all published entries in data/invites.json**, regardless of platform, featured status or verification. Code details are index,follow; previews stay noindex. Indexing never guarantees redemption, invite availability or rewards.

[llms.txt](../llms.txt) is curated public navigation, not a live validity feed or guaranteed search-indexing mechanism. Preserve factual, visible SEO content and avoid speculative claims.

The [country availability section](https://muse.eplus.dev/#availability) is dated, not a live eligibility check. As checked 12 November 2026, Meta had announced the United States, Canada, Japan, Singapore and Mexico. Vietnam was not among those confirmed markets, and an invite cannot override regional restrictions. Primary sources: [US](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [Canada](https://about.fb.com/news/2026/09/introducing-muse-small-business/), [Japan](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/), [Singapore](https://about.fb.com/news/2026/10/muse-is-now-available-in-singapore-the-worlds-first-personal-ai-agent-built-for-everyone/), [Mexico](https://about.fb.com/ltam/news/2026/09/presentamos-muse-el-primer-agente-de-ia-personal-del-mundo-creado-para-todos/). Canada is labeled "confirmed by 29 September", not assigned an invented specific rollout date. Update links, checked date and SEO tests together when a new market is confirmed.

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
