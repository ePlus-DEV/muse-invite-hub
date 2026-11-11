# ✦ Muse Invite Hub

**Share the spark.** A community-powered, open-source directory of [Muse](https://muse.ai/) invitation and referral codes from [ePlus.DEV](https://eplus.dev).

[Open the website](https://muse.eplus.dev/) · [Share a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml) · [Report a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml)

> Muse Invite Hub is independent and not affiliated with Meta or Muse. Entries are community listings or owner reports, not a promise of live validity, access or token rewards.

## Features

- Responsive static site with search, filters, sorting and copy-to-clipboard
- Catalog stats based on published invite entries
- Featured owner's invite `DPNIHH` shown prominently in the hero and pinned above community codes with a **Verified Owner** badge. This confirms only the site owner's declaration of ownership, not successful redemption on Muse.
- GitHub Issue Forms for contributing codes and reporting success/failure feedback
- Contributor attribution and dated owner-reported invitation counts, including **remaining slots = capacity − used** (never live availability)
- Maintainer-reviewed changes to the public JSON catalog (no auto-publication)
- CI validation, automated tests, GitHub Pages deployment on main, and isolated PR previews under /pr-preview/pr-N/
- No backend, external account connection, credentials or npm dependencies

## How to contribute

1. Open the [Share code issue form](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml).
2. Provide only a public invite code you are authorized to share. Do not include credentials.
3. A maintainer checks for duplicates, reviews the issue, and updates [data/invites.json](data/invites.json) via a PR.
4. Report broken codes using [Report a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml).

**Community catalog:** The directory contains 11 community-shared codes and the featured owner code `DPNIHH`. The community entries were curated from earlier public postings, and credited contributor usernames are retained. Listing a code does **not** mean its contributor submitted it directly to this website or that Muse confirmed redemption. These entries remain `unverified` until actual feedback is reviewed. The site owner confirmed ownership of `DPNIHH`; its **Verified Owner** badge confirms only this declaration, not active redemption.

## Updating remaining invite slots

**DPNIHH**: the owner reported **3 of 30 invitations remaining** in [issue #14](https://github.com/ePlus-DEV/muse-invite-hub/issues/14) on **2026-11-11**. This is a dated, owner-reported snapshot, not live Muse availability. The catalog stores `reportedCapacity: 30`, `reportedUses: 27` (calculated as 30 − 3), and `usageReportedAt: 2026-11-11`.

Open the [Update remaining slots GitHub Issue Form](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=update-count.yml&invite_code=DPNIHH) with the total invite capacity and actual number already used displayed by the owner’s Muse account. A maintainer checks the report and updates `reportedCapacity`, `reportedUses` and `usageReportedAt` in `data/invites.json` via a PR. Once merged, the page shows **reported remaining = capacity − uses**, with the reporting date and **Not live** label.

Counts vary by account and may change after a report; copying a code does not consume or confirm a redemption. There is no integration with Muse's private referral dashboard and no automatic balance sync.

## Run locally

No build is required. Serve the repository directory over HTTP:

    python -m http.server 8000

Open http://localhost:8000/ . Avoid opening a file URL directly because browsers restrict local JSON requests.

Run checks before opening a PR:

    node scripts/validate.mjs
    node scripts/audit-links.mjs
    node --test scripts/validate.test.mjs scripts/preview.test.mjs scripts/audit-links.test.mjs
    node --check assets/app.js

Node 24 is used by CI.

## Pull request previews

Every **same-repository PR targeting main** is eligible for a shareable preview after the Validate website and invite catalog check passes.

- Preview URL: https://muse.eplus.dev/pr-preview/pr-123/ (replace 123 with the PR number). The workflow **comments the actual URL on the PR only after it verifies the published revision and all critical assets**. Do not assume a guessed URL is ready.
- Production content always comes from trusted main. The publisher fetches the GitHub-generated PR merge revision and copies only approved static site files into a dedicated directory. It **does not execute PR scripts** or use a personal access token.
- Every preview has a noindex meta tag, a PR-specific base path, and a preview-meta.json file containing the PR head SHA. Previews do not inherit production canonical URLs. Production SEO and the CNAME stay at the root of the deployment.
- On a new push, the previous preview is invalidated until CI passes on the latest commit; on PR closure, the preview directory is removed during the next Pages deployment. The bot updates its PR comment.
- GitHub Pages publishes an **entire-site artifact** each time. The trusted workflow rebuilds the latest main site plus all currently eligible open PR previews together, so deploying one PR does not delete previews for other open PRs.
- A new PR also gets a downloadable **muse-invite-hub-pr-preview-N** artifact from its read-only Validate workflow. To inspect that offline artifact, extract it, serve it with a local HTTP server, and open localhost; file:// cannot load the JSON catalog.
- Fork PRs receive normal CI but do not automatically receive public same-origin previews. This prevents arbitrary external contributions from being published under the production domain.

## Publish

In GitHub repository **Settings → Pages**, use **Source: GitHub Actions** and set **Custom domain** to `muse.eplus.dev`. **Production domain:** https://muse.eplus.dev/. The root `CNAME` records the hostname, while GitHub Pages settings control the actual custom-domain connection. Deployments and preview publication run through the existing Pages workflow.

Configure DNS for the `eplus.dev` zone:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `muse` | `eplus-dev.github.io` | DNS only (if Cloudflare is used, at least during initial verification) |

Do not point DNS to `eplus-dev.github.io/muse-invite-hub`; DNS CNAMEs have no path. Add the custom domain in GitHub Pages **before** pointing DNS to avoid accidental domain takeover. Once DNS and certificate issuance settle, enable **Enforce HTTPS** in Pages settings and verify https://muse.eplus.dev/ directly.

The site uses relative asset paths and now sets canonical and social sharing URLs to the production domain. Its sitemap and robots.txt also reference the production domain. DNS is managed outside this repository; creating a PR here alone cannot change DNS or the GitHub Pages setting.

## License and policies

[MIT](LICENSE) · [Security](SECURITY.md) · [Agent rules](AGENTS.md)

© 2026 ePlus.DEV. No affiliation with Meta or Muse.
