# ✦ Muse Invite Hub

**Share the spark.** A community-powered, open-source directory of [Muse](https://muse.ai/) invitation and referral codes from [ePlus.DEV](https://eplus.dev).

[Open the website](https://eplus-dev.github.io/muse-invite-hub/) · [Share a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml) · [Report a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml)

> Muse Invite Hub is independent and not affiliated with Meta or Muse. Codes and statuses are community submissions, not a promise of live validity, access or token rewards.

## Features

- Responsive static site with search, filters, sorting and copy-to-clipboard
- Catalog stats based on published community-submitted entries
- GitHub Issue Forms for contributing codes and reporting problems
- Maintainer-reviewed changes to the public JSON catalog (no auto-publication)
- CI validation, automated tests, and GitHub Pages deployment on main
- No backend, external account connection, credentials or npm dependencies

## How to contribute

1. Open the [Share code issue form](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml).
2. Provide only a public invite code you are authorized to share. Do not include credentials.
3. A maintainer checks for duplicates, reviews the issue, and updates [data/invites.json](data/invites.json) via a PR.
4. Report broken codes using [Report a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml).

**The catalog starts empty.** This project does not invent real invite codes. See [CONTRIBUTING.md](CONTRIBUTING.md) for the data model and review process.

## Run locally

No build is required. Serve the repository directory over HTTP:

    python -m http.server 8000

Open http://localhost:8000/ . Avoid opening a file URL directly because browsers restrict local JSON requests.

Run checks before opening a PR:

    node scripts/validate.mjs
    node --test scripts/validate.test.mjs
    node --check assets/app.js

Node 24 is used by CI.

## Publish

In GitHub repository **Settings → Pages**, set **Source: GitHub Actions**. Merging a PR to main triggers the deployment workflow. The default URL is https://eplus-dev.github.io/muse-invite-hub/ . A custom domain may be configured later. Asset URLs are relative to support GitHub Pages project paths.

## License and policies

[MIT](LICENSE) · [Security](SECURITY.md) · [Agent rules](AGENTS.md)

© 2026 ePlus.DEV. No affiliation with Meta or Muse.
