# ✦ Muse Invite Hub

**Share the spark.** A community-powered, open-source directory of [Muse](https://muse.ai/) invitation and referral codes from [ePlus.DEV](https://eplus.dev).

[Open the website](https://muse.eplus.dev/) · [Share a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml) · [Report a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml)

> Muse Invite Hub is independent and not affiliated with Meta or Muse. Codes and statuses are community submissions, not a promise of live validity, access or token rewards.

## Features

- Responsive static site with search, filters, sorting and copy-to-clipboard
- Catalog stats based on published community-submitted entries
- GitHub Issue Forms for contributing codes and reporting success/failure feedback
- Original source links and dated contributor-reported usage snapshots (never live availability)
- Maintainer-reviewed changes to the public JSON catalog (no auto-publication)
- CI validation, automated tests, and GitHub Pages deployment on main
- No backend, external account connection, credentials or npm dependencies

## How to contribute

1. Open the [Share code issue form](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml).
2. Provide only a public invite code you are authorized to share. Do not include credentials.
3. A maintainer checks for duplicates, reviews the issue, and updates [data/invites.json](data/invites.json) via a PR.
4. Report broken codes using [Report a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml).

**Source-backed launch catalog:** The site includes 11 codes explicitly published in the public [Muse Use Cases](https://github.com/jaxxchen003/muse-use-cases) README or [invite-code issues](https://github.com/jaxxchen003/muse-use-cases/issues). Each card links to its source. All are **unverified**; we have not tested redemption or confirmed current availability with Muse.

The upstream repository inspired the GitHub Issue workflow and feedback model. Muse Invite Hub does not mirror its use-case catalog. See [CONTRIBUTING.md](CONTRIBUTING.md) for review rules.

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

In GitHub repository **Settings → Pages**, set **Source: GitHub Actions**. This initial one-time configuration must be done by a repository administrator. The first deployment failed at Configure Pages because Pages was not enabled; re-running with the default GITHUB_TOKEN alone cannot activate it. After enabling Pages, use **Actions → Deploy website to GitHub Pages → Run workflow** or merge a new PR to main. **Production domain: https://muse.eplus.dev/**. The previous default URL is https://eplus-dev.github.io/muse-invite-hub/ . For this site, set **Settings → Pages → Custom domain** to `muse.eplus.dev` and keep **Source: GitHub Actions**. The root `CNAME` file records the intended hostname but **does not configure the domain when deploying through GitHub Actions**; the GitHub Pages repository setting is authoritative.

Configure DNS for the `eplus.dev` zone:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `muse` | `eplus-dev.github.io` | DNS only (if Cloudflare is used, at least during initial verification) |

Do not point DNS to `eplus-dev.github.io/muse-invite-hub`; DNS CNAMEs have no path. Add the custom domain in GitHub Pages **before** pointing DNS to avoid accidental domain takeover. Once DNS and certificate issuance settle, enable **Enforce HTTPS** in Pages settings and verify https://muse.eplus.dev/ directly.

The site uses relative asset paths and now sets canonical and social sharing URLs to the production domain. Its sitemap and robots.txt also reference the production domain. DNS is managed outside this repository; creating a PR here alone cannot change DNS or the GitHub Pages setting.

## License and policies

[MIT](LICENSE) · [Security](SECURITY.md) · [Agent rules](AGENTS.md)

© 2026 ePlus.DEV. No affiliation with Meta or Muse.
