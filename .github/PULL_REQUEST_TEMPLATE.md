## What changed?

Describe the user-visible change and why it is needed. Link related Issues (use `Closes #123` only when the PR fully resolves them).

## Contribution type

- [ ] Invite data / status / quota
- [ ] UI / accessibility / bug fix
- [ ] SEO / metadata
- [ ] Documentation
- [ ] Other

## Review checklist

- [ ] Read `CONTRIBUTING.md` and relevant `AGENTS.md` rules
- [ ] No invented invite validity, ownership, quotas, status or reward claims
- [ ] No secrets, personal account data or unrelated repository links
- [ ] Ran `node scripts/validate.mjs` and `node scripts/audit-links.mjs`
- [ ] Ran Node.js tests and frontend syntax checks (or noted why not)
- [ ] For UI changes: checked desktop/mobile, filters, copy and affected detail pages
- [ ] Preserved homepage SEO title, description and canonical unless approved
- [ ] CI passes

## Preview or screenshots

For **same-repository PRs**, the bot posts a verified preview at `https://muse.eplus.dev/pr-preview/pr-N/` after CI and publication checks. The validation job also attaches an offline preview artifact.

**Fork PRs:** CI can run, but hosted same-origin previews and that artifact are not automatic. Never claim a URL is working before it has been verified.

## Reviewer notes

Mention any known limitations or behavior changes. PR changes go live only after a maintainer merges them to `main`.
