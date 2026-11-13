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
node --test scripts/issue-to-pr.test.mjs scripts/close-accepted-issues.test.mjs
~~~

For a complete generated site before merging, download the muse-invite-hub-pr-preview-N artifact from the PR Validate workflow, extract it and serve that folder over HTTP. Detail pages will be at /codes/CODE/. Test mobile/desktop, search, filtering, sort, copy, empty and network-error states, and feedback links.

## Catalog provenance and availability

The published catalog is [data/invites.json](../data/invites.json). Codes are unique across every source platform.

- GitHub entries use the submittedBy field. This identifies a GitHub account only.
- Public Threads, X (Twitter) and Facebook entries use validated HTTPS sourceUrl links instead of GitHub owner fields. Example original-post formats: https://www.threads.com/@handle/post/ID, https://x.com/handle/status/123456789 and https://www.facebook.com/handle/posts/ID.
- The UI derives the source platform and handle from those public URLs. Automated Issue submissions require original post links; profiles, ambiguous sources and Facebook share-shortlinks need manual review. A GitHub reporter is not automatically the owner of a social account with the same handle.
- Codes carry community statuses such as unverified, reported-working and reported-not-working. These are not official Muse validation. Threads demo codes 18I70N and XZ4PV6 were user-supplied; their profile links alone do not independently prove the code was posted or works.

Usage figures are **dated self-reported snapshots**, not live balances. When capacity and used count are known, remaining = capacity - used. A remaining-only report is also allowed without guessing a total. The owner reported **3 of 30 remaining** for DPNIHH in [Issue #14](https://github.com/ePlus-DEV/muse-invite-hub/issues/14) on 2026-11-11. Owner confirmation proves ownership only; copying a code does not redeem it.

## Issue automation and acceptance

See the [visual contribution flow](CONTRIBUTION_FLOW.md) for the canonical Issue vs comment vs legacy Sub-issue paths and their different closure behavior.

The [Issue-to-Draft-PR workflow](../.github/workflows/issue-to-pr.yml) validates Issue Form submissions, checks duplicates and creates review-only Draft PRs for changes to the catalog.

- GitHub owners may propose dated quota updates under ownership checks. A Threads, X or Facebook reporter cannot claim GitHub quota ownership through a matching handle.
- The directory links feedback to one canonical GitHub Issue per published code. Contributor-submitted codes reuse their original Issue. Missing threads for manual/imported codes are created once during trusted production Pages build; PR validation is read-only.
- A human comment on a closed canonical Issue reopens it for review. Structured accepted/rejected reports or GitHub-owner-confirmed quota updates are passed through the existing catalog validator and may produce a **review-only Draft PR**. Ordinary discussion, conflicting updates or unsupported ownership remain for manual review. A comment never directly changes `status`, `checkedAt` or Muse availability. The contribution acceptance bot skips reopened feedback threads; legacy feedback/count Issue Forms remain fallback-only.
- Maintainers must review and merge accepted PRs into main. Submitting an Issue or opening a Draft PR never publishes a code automatically.
- After successful deployment, trusted automation verifies the approved merge is deployed and the detail page is accessible. It comments https://muse.eplus.dev/codes/CODE/ on the original Issue **before** closing it. If checks or commenting fail, the Issue stays open.

The detailed step-by-step instructions for contributors and reviewers are in [CONTRIBUTING.md](../CONTRIBUTING.md).

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
| data/invites.json | Reviewed public code catalog |
| scripts/validate.mjs, scripts/audit-links.mjs | Data and link validation |
| scripts/site-pages.mjs | Generated detail pages and sitemap |
| scripts/preview-core.mjs, scripts/build-pages.mjs | Preview and production site assembly |
| scripts/issue-to-pr.mjs, scripts/close-accepted-issues.mjs | Review-only Issue proposals and acceptance notification |
| .github/ISSUE_TEMPLATE/, .github/workflows/ | Issue Forms, CI and Pages deployment |

Preserve contributor attribution and project independence from Muse/Meta. See [AGENTS.md](../AGENTS.md) for non-negotiable safety and SEO policies.
