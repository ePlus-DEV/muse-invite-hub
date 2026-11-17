# ✦ Muse Invite Hub

**Share the spark.** An open-source directory of community-shared [Muse](https://muse.ai/) invite codes, maintained by [ePlus.DEV](https://eplus.dev).

[**Explore invite codes**](https://muse.eplus.dev/) · [**Choose how to contribute**](https://muse.eplus.dev/#contribute) · [**Contribution guide**](CONTRIBUTING.md)

[![Open Issues](https://img.shields.io/github/issues/ePlus-DEV/muse-invite-hub?label=Issues%20open&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/issues?q=is%3Aissue%20is%3Aopen) [![Closed Issues](https://img.shields.io/github/issues-closed/ePlus-DEV/muse-invite-hub?label=Issues%20closed&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/issues?q=is%3Aissue%20is%3Aclosed) [![Open PRs](https://img.shields.io/github/issues-pr/ePlus-DEV/muse-invite-hub?label=PRs%20open&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/pulls?q=is%3Apr%20is%3Aopen) [![Closed PRs](https://img.shields.io/github/issues-pr-closed/ePlus-DEV/muse-invite-hub?label=PRs%20closed&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/pulls?q=is%3Apr%20is%3Aclosed)

> **Independent community project.** Not affiliated with or endorsed by Muse or Meta. Listed codes and reported invite counts are not guaranteed to work or remain available.

## Features

- **One directory:** browse, search, filter and sort invite codes shared on GitHub, Threads, X (Twitter), Facebook and Telegram. New submissions follow Muse's 6-character alphanumeric invite format (A–Z, 0–9; no hyphens), but matching the format does not guarantee redemption.
- **[Country availability map](https://muse.eplus.dev/countries/):** interactive, accessible world map showing five Meta-announced Muse launch markets as rechecked 16 November 2026, with primary sources. Highlighted countries do not guarantee individual account eligibility. Boundaries: Natural Earth (public domain).
- **Saved codes:** bookmark codes on the homepage or detail page and filter by saved items. Bookmarks are stored only in this browser (no accounts or server synchronization).
- **Copied codes:** successfully copied codes get a separate violet highlight and **Copy again** label on both directory cards and detail pages, persisting only in this browser. Copying is not proof that Muse accepted the code.
- **Recently updated:** sort by the latest recorded listing date, reported usage date or catalog check. This does not verify current Muse redemption.
- **Quick feedback:** each published invite has one canonical GitHub Issue for reports and discussion. Contributor-submitted codes reuse their original Issue; other published codes receive a unique Issue during trusted Pages deploy. Worked/Didn't work buttons open an editable comment dialog before linking to that Issue. Posting a structured report can reopen a closed thread and propose a Draft PR for maintainer review; feedback never automatically verifies Muse redemption.
- **Code details:** copy and share individual codes, view source attribution and community-reported status.
- **Community contributions:** submit new codes with an Issue Form; report feedback and owner-count updates on the existing code Issue using the website's editable comment dialog.
- **Optional Telegram companion:** browse codes, contribute or report feedback from a private chat, and opt into alerts when configured. [How to use the bot](docs/TELEGRAM_BOT_GUIDE.md).
- **Validated contributions:** eligible new GitHub-owned codes and single-code strict public-social-permalink reports can be published automatically as **unverified** after source/consent, duplicate, exact-record and green-CI checks. Ambiguous social sources and updates to existing codes require maintainer review. Accepted Issues receive a link to their published code after deployment; verified owner-count comment updates can also close their canonical Issue after publication.

## How publication works

1. **New GitHub-owned invite codes:** use the [Share Code Issue Form](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml), enter 1–10 distinct new codes, select **GitHub (my own code)** and personally check both consent/privacy boxes. The bot checks duplicates, creates separate JSON records in a **Ready PR**, and validates the exact submission again before auto-merging after green CI. Grouped submissions cannot include shared quota figures.
2. **New codes from Threads, X or Facebook:** include a direct original public post URL and complete both contributor confirmations. One new code with a strict supported public permalink may auto-publish **as an unverified community report** after the trusted checks; ambiguous URLs, grouped social codes, source conflicts, existing-code changes and feedback require manual review.
3. **After publication:** GitHub Pages is built from trusted `main`. The bot verifies the live code detail, comments the canonical link on the original Issue, and **only then** closes an accepted new-code Issue. For a reviewed **owner-count update submitted as a comment**, it also checks the live quota snapshot and that no newer human feedback exists before posting a completion comment and closing the canonical Issue; new feedback may reopen it. Published community codes remain **`unverified`**; listing a code never guarantees Muse redemption or available invites.

Missing confirmations or malformed fields are handled on the **existing open Issue** with editing instructions—there is no need to create a replacement Issue. For a code already published, use its existing canonical Issue for reports and quota updates. Automatic merge can be blocked by failed CI, a conflict, `do-not-merge` or an explicit maintainer cancellation.

## Contribute

**[See the latest contribution flow diagram](docs/CONTRIBUTION_FLOW.md)** — distinguishes automatically published new GitHub codes, human-reviewed social sources and existing-code feedback.

No coding required:

- [**Choose a contribution channel (Telegram, GitHub or feedback)**](https://muse.eplus.dev/#contribute) — the website also shows a self-hosted QR for mobile access
- [**Share a public invite via GitHub Form**](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml)
- [**Telegram bot user guide**](docs/TELEGRAM_BOT_GUIDE.md) — commands and public attribution requirements
- [**Report code feedback**](https://muse.eplus.dev/#codes)
- [**Update invite count on an existing code**](https://muse.eplus.dev/#codes)
- [**Contribute code or documentation**](CONTRIBUTING.md#contribute-code-or-documentation)

All Issues and comments are public. New GitHub-owned codes may publish automatically after repository checks, **without human review of validity**; never share passwords, session tokens or private account information. See the [contribution guide](CONTRIBUTING.md) for instructions.

## Telegram bot (optional)

Muse Invite Hub also has an **optional Telegram companion** for browsing invite codes, checking review status, sharing public codes and reporting feedback in a private chat. See the [user-facing Telegram bot guide](docs/TELEGRAM_BOT_GUIDE.md) for commands, privacy and review rules.

- **Contributing:** `/submit CODE` requests explicit public-sharing and username consent, then creates the same `[Invite] CODE` GitHub Issue format used by the website. Automation opens an **unverified Draft PR** for maintainer review; the code is **not automatically published**.
- **Feedback:** `/report CODE worked|failed` posts a review-only public comment on the canonical Issue; it does not automatically change reported code validity or invite counts.
- **Browsing and alerts:** `/codes`, `/search`, `/status CODE`, `/watch CODE` and `/subscribe`. Notifications require the separately configured, opt-in bot endpoint.
- **Privacy:** A public Telegram `@username` and profile may be shared only after confirmation. Numeric chat IDs and preferences remain private. Neither public profiles nor Issue authorship establish Muse code ownership.
- **Anti-spam:** Submissions are rate-limited and checked against existing catalog/Issues. Deleting the canonical Issue invalidates still-open bot-generated data PRs.

**Bot link and QR:** The contribution section at [muse.eplus.dev/#contribute](https://muse.eplus.dev/#contribute) prioritizes Telegram, while retaining GitHub and existing-code feedback. Its downloadable, self-hosted QR points to that stable website section; it **does not** open a Telegram bot. This repository does not currently provide a verified public bot `@username` or `t.me` URL. The site links to the guide rather than guessing a bot account. You can still [share a code using GitHub](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml).

**For maintainers:** Bot runtime and GitHub Pages are separate. See [Cloudflare Worker](telegram/WORKERS.md), [OCI ARM64/Docker](telegram/README.md), [Cloudflare auto-deploy](docs/TELEGRAM_CLOUDFLARE_AUTODEPLOY.md), and [publication notifications](docs/TELEGRAM_NOTIFICATIONS.md). Merging website code alone does not guarantee bot deployment. Never commit credentials or private state.

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
