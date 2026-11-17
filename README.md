# ✦ Muse Invite Hub

**Share the spark.** An open-source directory of community-shared [Muse](https://muse.ai/) invite codes, maintained by [ePlus.DEV](https://eplus.dev).

[**Explore invite codes**](https://muse.eplus.dev/) · [**Contribute**](CONTRIBUTING.md) · [**Report an issue**](https://muse.eplus.dev/#codes)

[![Open Issues](https://img.shields.io/github/issues/ePlus-DEV/muse-invite-hub?label=Issues%20open&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/issues?q=is%3Aissue%20is%3Aopen) [![Closed Issues](https://img.shields.io/github/issues-closed/ePlus-DEV/muse-invite-hub?label=Issues%20closed&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/issues?q=is%3Aissue%20is%3Aclosed) [![Open PRs](https://img.shields.io/github/issues-pr/ePlus-DEV/muse-invite-hub?label=PRs%20open&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/pulls?q=is%3Apr%20is%3Aopen) [![Closed PRs](https://img.shields.io/github/issues-pr-closed/ePlus-DEV/muse-invite-hub?label=PRs%20closed&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/pulls?q=is%3Apr%20is%3Aclosed)

> **Independent community project.** Not affiliated with or endorsed by Muse or Meta. Listed codes and reported invite counts are not guaranteed to work or remain available.

## Features

- **One directory:** browse, search, filter and sort invite codes shared on GitHub, Threads, X (Twitter), Facebook and Telegram. New submissions follow Muse's 6-character alphanumeric invite format (A–Z, 0–9; no hyphens), but matching the format does not guarantee redemption.
- **[Country availability map](https://muse.eplus.dev/countries/):** interactive, accessible world map showing five Meta-announced Muse launch markets as rechecked 16 November 2026, with primary sources. Highlighted countries do not guarantee individual account eligibility. Boundaries: Natural Earth (public domain).
- **Saved codes:** bookmark codes on the homepage or detail page and filter by saved items. Bookmarks are stored only in this browser (no accounts or server synchronization).
- **Copied codes:** successfully copied codes show the same soft brand-blue **Copied** button on all directory cards, including featured and Verified Owner cards. It remains clickable to copy again, and the detail page uses the same blue copied highlight. The state persists only in this browser; copying never proves Muse redemption.
- **Recently updated:** sort by the latest recorded listing date, reported usage date or catalog check. This does not verify current Muse redemption.
- **Quick feedback:** each published invite has one canonical GitHub Issue for reports and discussion. A structured Worked/Didn't work comment creates a **review-only Draft PR**. That PR adds or updates `feedback-stats/<CODE>.json` with the reporter's public GitHub numeric ID, approved comment ID, date and latest self-reported outcome. Counts change **only when the reviewed PR is merged**; a repeated report by the same GitHub account replaces its previous outcome rather than incrementing twice. Trusted Pages builds summarize the committed JSON into public `data/feedback-counts.json` **without fetching or recounting historical comments**. An absent ledger means no approved reports (0/0), not evidence that Muse accepted or rejected a code. The website's thumb buttons still open an editable GitHub feedback dialog rather than casting a direct vote. Contributor feedback is not a Muse verification.

- **Accepted quota updates:** GitHub-owned cards can show a small blue number on the Update count icon only when a reviewed revision of a previously reported quota was published. DPNIHH has **1** documented historical update (original Issue #14, reviewed PR #157) in a separate validated preview-compatible baseline file; future accepted updates accumulate in the catalog record. This is not a click count, live Muse usage, or a reconstructed all-time history for older records. New changes increment only after acceptance; initial reports and duplicate submissions do not increase the number.
- **Consistent code cards:** every listing shows the same status/code/source/availability/dated listing fields and action positions. Verified Owner confirms attribution only, not Muse redemption; a reported quota's separate observation date remains available via tooltip and in details.
- **Code details:** the desktop page shows one SEO-readable H1 above the content, a streamlined invite hero with Verified Owner/Save, large readable code + small copy icon, Open invite/Copy actions, and a three-column summary of reported remaining slots, report date and recorded quota updates. A separate two-step How-to panel sits below, while the right side contains code provenance and approved community feedback; the country-availability disclosure remains linked below. Mobile stacks the two main actions, keeps the three compact stats and collapses the How-to/Code details panels. All content remains in generated HTML with the existing canonical, metadata, JSON-LD and noindex PR-preview rules.
- **Share code popup:** one-click `Share code` actions on the homepage, country map and invite details open an accessible choice dialog without navigating or scrolling. It links directly to the [Muse Invite Hub Telegram bot](https://t.me/muse_invite_hub_bot) (not a guide or share picker), and offers the GitHub Issue Form and per-code feedback. The QR `https://muse.eplus.dev/#contribute` opens the same dialog. The normal GitHub Issue URL remains usable with JavaScript disabled; the direct Telegram link is the project-maintainer-provided bot handle.
- **Community contributions:** submit new codes with an Issue Form; report feedback and owner-count updates on the existing code Issue using the website's editable comment dialog.
- **Validated contributions:** eligible new GitHub-owned codes and single-code strict public-social-permalink reports can be published automatically as **unverified** after source/consent, duplicate, exact-record and green-CI checks. Ambiguous social sources and updates to existing codes require maintainer review. Accepted Issues receive a link to their published code after deployment; verified owner-count comment updates can also close their canonical Issue after publication.

## How publication works

1. **New GitHub-owned invite codes:** use the [Share Code Issue Form](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml), enter 1–10 distinct new codes, select **GitHub (my own code)** and personally check both consent/privacy boxes. The bot checks duplicates, creates separate JSON records in a **Ready PR**, and validates the exact submission again before auto-merging after green CI. Grouped submissions cannot include shared quota figures.
2. **New codes from Threads, X or Facebook:** include a direct original public post URL and complete both contributor confirmations. One new code with a strict supported public permalink may auto-publish **as an unverified community report** after the trusted checks; ambiguous URLs, grouped social codes, source conflicts, existing-code changes and feedback require manual review.
3. **After publication:** GitHub Pages is built from trusted `main`. The bot verifies the live code detail, comments the canonical link on the original Issue, and **only then** closes an accepted new-code Issue. For a reviewed **owner-count update submitted as a comment**, it also checks the live quota snapshot and that no newer human feedback exists before posting a completion comment and closing the canonical Issue; new feedback may reopen it. Published community codes remain **`unverified`**; listing a code never guarantees Muse redemption or available invites.

Missing confirmations or malformed fields are handled on the **existing open Issue** with editing instructions—there is no need to create a replacement Issue. For a code already published, use its existing canonical Issue for reports and quota updates. Automatic merge can be blocked by failed CI, a conflict, `do-not-merge` or an explicit maintainer cancellation.

## Contribute

**[See the latest contribution flow diagram](docs/CONTRIBUTION_FLOW.md)** — distinguishes automatically published new GitHub codes, human-reviewed social sources and existing-code feedback.

No coding required:

- [**Share an invite code on GitHub**](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml) or [**via Telegram bot**](https://t.me/muse_invite_hub_bot) (no GitHub account)
- [**Report code feedback**](https://muse.eplus.dev/#codes)
- [**Update invite count on an existing code**](https://muse.eplus.dev/#codes)
- [**Contribute code or documentation**](CONTRIBUTING.md#contribute-code-or-documentation)

All Issues and comments are public. New GitHub-owned codes may publish automatically after repository checks, **without human review of validity**; never share passwords, session tokens or private account information. See the [contribution guide](CONTRIBUTING.md) for instructions.

## Optional Telegram Bot (OCI ARM64)

The Telegram bot is an **optional**, separate Node.js 24 webhook service for an Oracle Cloud Ampere A1 ARM64 VM. Its Docker image can be built manually for `linux/arm64` and served behind Caddy HTTPS. GitHub Pages and the trusted `main` catalog remain the source of public website data.

- [Telegram deployment guide](telegram/README.md) — VM, Docker Compose, DNS, BotFather, HTTPS and private credentials.
- [Manual ARM64 image workflow](.github/workflows/telegram-oci-image.yml) — build and publish to GHCR from trusted `main`; it never provisions or deploys the VM.
- Telegram supports `/submit CODE`, `/report CODE worked|failed`, `/status CODE` for published/pending review, `/codes`, `/privacy` and `/cancel`. BotFather lists these commands in private chats. `/submit` and `/report` use the **existing GitHub Issue/comment discussion queue**, require user confirmation and **remain human-reviewed**. They do not establish GitHub code ownership and cannot bypass the website's separate GitHub-owned new-code auto-publish safeguards.

Optional publication notifications are supported through a separately configured, HMAC-signed Pages-to-bot endpoint. Only users who opt in through Telegram receive new-code alerts; private Telegram chat IDs never appear in public Issues. The first verified Pages event initializes a baseline without sending historical codes. The bot runtime and repository Actions variable/secret must be configured manually; no hourly polling.

This repository does not provision a Telegram bot account, Oracle VM, domain name or runtime secrets.

## Development

Static HTML, CSS and JavaScript — no backend or npm dependencies. To run the homepage locally:

~~~sh
node scripts/serve.mjs
~~~

Open http://localhost:8000/. Generated code-detail pages, Node.js 24 tests, previews and deployment are covered in the [project guide](docs/PROJECT_GUIDE.md).

## Resources

[Country map](https://muse.eplus.dev/countries/) · [Contribution flow](docs/CONTRIBUTION_FLOW.md) · [Project guide](docs/PROJECT_GUIDE.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Agent rules](AGENTS.md) · [License](LICENSE)

© 2026 ePlus.DEV

Cloudflare Workers deployment is separate from GitHub Pages. See [Telegram automatic deployment](docs/TELEGRAM_CLOUDFLARE_AUTODEPLOY.md) to connect the existing bot Worker to GitHub `main`, preserve KV state, and verify its deployed `/version`.
