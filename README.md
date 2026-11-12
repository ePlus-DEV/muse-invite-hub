# ✦ Muse Invite Hub

**Share the spark.** An open-source directory of community-shared [Muse](https://muse.ai/) invite codes, maintained by [ePlus.DEV](https://eplus.dev).

[**Explore invite codes**](https://muse.eplus.dev/) · [**Contribute**](CONTRIBUTING.md) · [**Report an issue**](https://muse.eplus.dev/#codes)

[![Open Issues](https://img.shields.io/github/issues/ePlus-DEV/muse-invite-hub?label=Issues%20open&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/issues?q=is%3Aissue%20is%3Aopen) [![Closed Issues](https://img.shields.io/github/issues-closed/ePlus-DEV/muse-invite-hub?label=Issues%20closed&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/issues?q=is%3Aissue%20is%3Aclosed) [![Open PRs](https://img.shields.io/github/issues-pr/ePlus-DEV/muse-invite-hub?label=PRs%20open&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/pulls?q=is%3Apr%20is%3Aopen) [![Closed PRs](https://img.shields.io/github/issues-pr-closed/ePlus-DEV/muse-invite-hub?label=PRs%20closed&style=flat-square)](https://github.com/ePlus-DEV/muse-invite-hub/pulls?q=is%3Apr%20is%3Aclosed)

> **Independent community project.** Not affiliated with or endorsed by Muse or Meta. Listed codes and reported invite counts are not guaranteed to work or remain available.

## Features

- **One directory:** browse, search, filter and sort invite codes shared on GitHub, Threads, X (Twitter) and Facebook.
- **Saved codes:** bookmark codes on the homepage or detail page and filter by saved items. Bookmarks are stored only in this browser (no accounts or server synchronization).
- **Copied codes:** successfully copied codes get a separate violet highlight and **Copy again** label on both directory cards and detail pages, persisting only in this browser. Copying is not proof that Muse accepted the code.
- **Recently updated:** sort by the latest recorded listing date, reported usage date or catalog check. This does not verify current Muse redemption.
- **Quick feedback:** each published invite has one canonical GitHub Issue for reports and discussion. Contributor-submitted codes reuse their original Issue; other published codes receive a unique Issue during trusted Pages deploy. Worked/Didn't work buttons open an editable comment dialog before linking to that Issue. Posting a structured report can reopen a closed thread and propose a Draft PR for maintainer review; feedback never automatically verifies Muse redemption.
- **Code details:** copy and share individual codes, view source attribution and community-reported status.
- **Community contributions:** submit new codes with an Issue Form; report feedback and owner-count updates on the existing code Issue using the website's editable comment dialog.
- **Reviewed updates:** maintainers review contributions before publication; accepted Issues receive a link to their published code.

## Contribute

No coding required:

- [**Share an invite code**](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml)
- [**Report code feedback**](https://muse.eplus.dev/#codes)
- [**Update invite count on an existing code**](https://muse.eplus.dev/#codes)
- [**Contribute code or documentation**](CONTRIBUTING.md#contribute-code-or-documentation)

All Issue submissions are public and reviewed; never share passwords, session tokens or private account information. See the [contribution guide](CONTRIBUTING.md) for instructions.

## Telegram Bot on Oracle Always Free

The optional Telegram Bot runs as a **linux/arm64 Docker image** on an Oracle Cloud Always Free Ampere A1 VM, with Caddy HTTPS and an HTTPS webhook. GitHub Pages remains the only published catalog. Bot-submitted codes and feedback go into the **existing GitHub Issues** review queue; Telegram does not establish GitHub identity or Muse redemption, and nothing auto-merges.

- [Telegram deployment runbook](telegram/README.md) — OCI ARM64 VM, DNS, BotFather, Docker Compose, secrets and webhook registration.
- [Build Telegram OCI ARM64 image](.github/workflows/telegram-oci-image.yml) — **manual only** after review and merge to main.

No bot, VM, cloud credentials or hostname is provisioned by the repository itself.

## Development

Static HTML, CSS and JavaScript — no backend or npm dependencies. To run the homepage locally:

~~~sh
node scripts/serve.mjs
~~~

Open http://localhost:8000/. Generated code-detail pages, Node.js 24 tests, previews and deployment are covered in the [project guide](docs/PROJECT_GUIDE.md).

## Resources

[Project guide](docs/PROJECT_GUIDE.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Agent rules](AGENTS.md) · [License](LICENSE)

© 2026 ePlus.DEV
