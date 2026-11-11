# Muse Invite Hub

A community-powered directory of Muse invite and referral codes, built by [ePlus.DEV](https://eplus.dev).

> Independent community project. Not affiliated with or endorsed by Meta or Muse. Codes are community-submitted; availability, eligibility and reward terms are determined solely by Muse.

The website source, contribution forms, GitHub Pages deployment, and validation workflow are maintained in this repository.

## Contributing

Open an issue to [share a code](https://github.com/ePlus-DEV/-muse-invite-hub/issues/new?template=share-code.yml) or [report a code](https://github.com/ePlus-DEV/-muse-invite-hub/issues/new?template=report-code.yml). A maintainer reviews submissions before adding or updating the public JSON catalog.

See [CONTRIBUTING.md](CONTRIBUTING.md) for schema and moderation rules.

## Development

This project is static HTML, CSS, and JavaScript: no backend, credentials, or build dependencies. Serve this directory using a local HTTP server, e.g. `python -m http.server 8000`, then visit http://localhost:8000. Run `node scripts/validate.mjs` before submitting data changes.

## Deployment

GitHub Actions publishes the site from `main` to GitHub Pages when Pages is configured with **Source: GitHub Actions**. The default project-site URL is [eplus-dev.github.io/-muse-invite-hub](https://eplus-dev.github.io/-muse-invite-hub/).

© 2026 ePlus.DEV · MIT License.
