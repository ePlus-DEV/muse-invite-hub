# AGENTS.md — Muse Invite Hub

Static website: HTML, CSS, JavaScript, JSON and GitHub Actions. No npm dependencies or backend required.

## Rules

- Never invent invite codes, redemptions, reward amounts, account eligibility or live validity.
- Treat code statuses as community-reported, potentially outdated.
- Never automatically publish user-submitted GitHub Issue content. Review and deduplicate before modifying data/invites.json.
- Never request, store or publish passwords, OTPs, access tokens, private login links, cookies or personal data.
- Render untrusted data using textContent only; never inject raw HTML or execute user submissions.
- Never claim affiliation with or endorsement by Meta or Muse.
- Preserve existing SEO titles, descriptions, URLs and other content unless explicitly requested.
- Main is production. Work through independent branches and PRs. Never force-push or stack PRs.
- Keep relative asset paths so GitHub Pages works with project subpaths and custom domains.

## Checks

- node scripts/validate.mjs
- node --test scripts/validate.test.mjs
- node --check assets/app.js
- Verify desktop/mobile, filters/search/sort, copy, empty and network-error states.

Copying a code is not the same as redeeming it.
