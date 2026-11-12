# ✦ Muse Invite Hub

**Share the spark.** A free, open-source directory of community-shared [Muse](https://muse.ai/) invitation codes, maintained by [ePlus.DEV](https://eplus.dev).

[**Visit the website**](https://muse.eplus.dev/) · [**Contribute**](CONTRIBUTING.md) · [**Report a problem**](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml) · [**Security**](SECURITY.md)

> **Independent community project.** Muse Invite Hub is not affiliated with or endorsed by Muse or Meta. Codes, usage reports and listed rewards are not guarantees of access, availability or redemption. Only Muse can confirm redemption.

## How to contribute

**You don't need to code.** Choose an Issue Form for what you want to share:

| Contribution | Action | Information needed |
| --- | --- | --- |
| **Share my invite code** | [Submit a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml) | Public code you own or are authorized to share; optional context |
| **Report whether a code works** | [Send feedback](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml) | Code, what happened in Muse, date and non-sensitive details |
| **Update remaining invites** | [Update count](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=update-count.yml) | Code, date and the real figures shown in your own Muse Invite screen |
| **Improve UI, code or docs** | [Contributor guide](CONTRIBUTING.md#contribute-code-or-documentation) | A focused Pull Request against `main`, with tests |

GitHub Issues and PRs are **public**. Never post passwords, OTPs, cookies, session tokens, login links, private invitation links or personal account information. GitHub Actions checks new-code and complete quota submissions and can prepare **Draft PRs automatically**; clear accepted/rejected feedback can also become a Draft PR. A maintainer reviews the proposed change before merging. **An Issue never automatically publishes a code or updates production.**

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the full process, supported fields and local testing.

## AI agents, llms.txt and search discoverability

- [llms.txt](https://muse.eplus.dev/llms.txt) supplies concise public navigation links for AI agents and readers, not real-time invite validation or guaranteed search visibility.
- [AGENTS.md](AGENTS.md) documents coding-agent, SEO, and AEO safeguards.
- Homepage SEO metadata, canonical URL, GA4, and WebSite structured data are preserved. Owner-confirmed detail pages may be indexed; unverified detail pages and PR previews retain their noindex rules.
- Clear, accurate Q&A helps users understand how to copy and contribute codes. Google Search does not require llms.txt to appear in AI results.

Run `node --test scripts/seo-aeo.test.mjs` with Node.js 24.

## Country availability (checked 12 November 2026)

Muse Invite Hub shows a compact, expandable, source-linked list of the five markets confirmed by Meta: **United States, Canada, Japan, Singapore and Mexico**. It is not a live eligibility checker. Vietnam is not among these confirmed launch markets; codes cannot override region restrictions.

Official sources: [US launch](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [Canada confirmation](https://about.fb.com/news/2026/09/introducing-muse-small-business/), [Japan launch](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/), [Singapore launch](https://about.fb.com/news/2026/10/muse-is-now-available-in-singapore-the-worlds-first-personal-ai-agent-built-for-everyone/), and [Mexico announcement](https://about.fb.com/ltam/news/2026/09/presentamos-muse-el-primer-agente-de-ia-personal-del-mundo-creado-para-todos/). Dates are sourced from Meta; for Canada we show **confirmed by 29 September** instead of claiming a specific launch date.

Update the source links, checked date and `scripts/seo-aeo.test.mjs` together when Meta announces another supported market. No unconfirmed launches or automatic eligibility promises.

## Features

- Search, filter, sort and browse the directory with **Load more** (12 codes per batch).
- Open pre-rendered code detail pages at `/codes/<CODE>/` for sharing, copying and reporting feedback.
- Show contributor attribution and community-reported code status, never official Muse validity.
- Display dated, owner-reported invite counts, or **Not reported** when data is incomplete.
- Feature the site owner's `DPNIHH` with **Verified Owner**, which confirms only ownership—not successful redemption.
- Review GitHub Issue Form submissions through automatically proposed Draft PRs, CI and isolated previews after review.

### What does the remaining count mean?

`Reported remaining = reportedCapacity − reportedUses`

The owner reported **3 of 30 remaining** for `DPNIHH` in [Issue #14](https://github.com/ePlus-DEV/muse-invite-hub/issues/14) on **2026-11-11** (30 total minus 27 used). This is a **dated snapshot, not live Muse availability**. Counts can change without this website knowing. Clicking Copy does not redeem or consume an invitation.

If you know only a remaining number, [submit that number](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=update-count.yml) without guessing the total. Remaining-only owner reports are displayed without a made-up total. The website does not connect to private Muse account data.

## Run and test locally

The homepage is a static HTML/CSS/JavaScript/JSON site with **no npm install or backend**. From the repository root:

~~~sh
python -m http.server 8000
~~~

Open http://localhost:8000/. Use HTTP rather than `file://` because the homepage fetches the JSON catalog.

**Detail pages are generated by the Pages build**, not stored in the source tree. To inspect the full rendered site before a merge, download the `muse-invite-hub-pr-preview-N` artifact from the PR's Validate workflow, extract it, and run an HTTP server inside the extracted folder.

For consistency with CI, use **Node.js 24** and run:

~~~sh
node scripts/validate.mjs
node scripts/audit-links.mjs
node --test scripts/validate.test.mjs scripts/audit-links.test.mjs scripts/preview.test.mjs scripts/site-pages.test.mjs
node --check assets/app.js
node --check assets/detail.js
node --check scripts/issue-to-pr.mjs
node --test scripts/issue-to-pr.test.mjs
~~~

Keep the existing homepage SEO title, description and canonical unless an authorized change explicitly calls for editing them.

## Automatic Issue → Draft PR

The [Issue-to-Draft-PR workflow](.github/workflows/issue-to-pr.yml) runs when a supported Issue is opened, reopened or edited. It checks code formats, duplicates, contributor permissions and quota consistency, then proposes a **Draft PR** changing only `data/invites.json`. It uses the repository `GITHUB_TOKEN`, **not** a personal access token. There is no hourly schedule and no auto-merge.

- **Invite:** adds an `unverified` listing, or proposes an **owner update** if the code already exists under the same GitHub account. Counts are dated self-reports; totals are never guessed.
- **Quota:** accepts consistent full counts **or remaining-only** reports from the listed code owner; third-party reports need manual review. GitHub numeric IDs are saved for owner updates when available.
- **Feedback:** proposes reported-working/not-working status for unambiguous user feedback; other cases remain for maintainer triage.
- **Review:** auto-created Draft PRs are excluded from publicly hosted PR previews until marked ready; only reviewed merges to `main` affect production.

**One-time GitHub setting:** In **Settings → Actions → General → Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests** (if allowed by the organization). If disabled, the workflow explains the blocked PR on the Issue. After enabling it, manually rerun **Issue to Draft PR → Run workflow** with the Issue number. [Full process](CONTRIBUTING.md#automatic-issue-to-draft-pr).

## Pull request previews

Open focused PRs against `main`. After a **same-repository PR** passes CI, the trusted Pages workflow rebuilds its preview at `https://muse.eplus.dev/pr-preview/pr-N/` and posts a link **only after verifying the deployed files and commit**. Generated detail pages appear below `/pr-preview/pr-N/codes/<CODE>/`. Do not assume a guessed preview URL is ready.

Same-repository PRs also receive a downloadable `muse-invite-hub-pr-preview-N` artifact. Fork PRs receive CI but **do not automatically receive hosted same-origin previews or that artifact**. Preview pages use `noindex` and disappear after a PR closes; **only merged changes on `main` affect production**.

## Project layout

| Path | What it does |
| --- | --- |
| `index.html` and `assets/` | Homepage, frontend controls, detail assets and social image |
| `data/invites.json` | Maintainer-reviewed public invite catalog |
| `scripts/validate.mjs` | Validate data, duplicates and statuses |
| `scripts/audit-links.mjs` | Check repository links |
| `scripts/site-pages.mjs` | Generate detail HTML and SEO sitemap |
| `scripts/preview-core.mjs` and `scripts/build-pages.mjs` | Assemble isolated PR previews and production output |
| `.github/ISSUE_TEMPLATE/` | Forms for sharing codes, feedback and count updates |
| `.github/workflows/` | CI and GitHub Pages deployment |

The homepage has WebSite structured data and an OG image. Detail pages have individual metadata and WebPage/BreadcrumbList schema. Only the featured owner-confirmed code is currently included in the sitemap for indexing; unverified detail pages have `noindex,follow`. All previews have `noindex,nofollow,noarchive`. Indexing is not a claim that Muse has accepted a code.

## Deployment

Production: https://muse.eplus.dev/. The site is published from `main` using GitHub Actions and GitHub Pages. **Settings → Pages** uses **Source: GitHub Actions** with custom domain `muse.eplus.dev`; the repository's `CNAME` records the hostname.

For the `eplus.dev` DNS zone, set `muse` as a CNAME to `eplus-dev.github.io` (DNS only during initial verification if using a proxy provider). A CNAME target has no URL path. Configure the custom domain in GitHub Pages before changing DNS, then enforce HTTPS when the certificate is ready. Domain and DNS settings are managed outside the repository.

The production publisher uses trusted code from `main` and builds previews from reviewed static inputs without executing unmerged PR scripts in the deployment job.

## License and policies

[MIT](LICENSE) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Agent rules](AGENTS.md)

© 2026 ePlus.DEV. No affiliation with Muse or Meta.
