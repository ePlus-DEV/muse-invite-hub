# Contributing to Muse Invite Hub

Thanks for sharing! The preferred contribution workflow for non-developers is a public GitHub Issue.

## Submit a public invite code

Open [Share a Muse invite code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml). Submit only a referral code you own or are authorized to share publicly. Do not submit passwords, 2FA codes, session tokens, private links, cookies or personal details. Public GitHub Issues are visible to everyone.

A maintainer reviews the issue and checks duplicates before updating the JSON catalog through a PR. **Issue creation does not automatically publish a code.**

## Report a nonworking code

Open [Report a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml) and describe the code and non-sensitive error details shown by Muse. A single report is feedback, not proof of global expiration.

## Data model

The file data/invites.json holds an array of entries with these fields:

| Field | Required | Specification |
| --- | --- | --- |
| id | Yes | Unique lowercase slug, e.g. community-001 |
| code | Yes | Unique 4–32 uppercase letters, numbers, or hyphens |
| status | Yes | unverified, reported-working, or reported-not-working |
| addedAt | Yes | Real calendar date YYYY-MM-DD |
| submittedBy | No | GitHub username (with permission to attribute) |
| note | No | Plain-text note, max 180 characters |
| sourceUrl | No | Optional private review reference; not linked from the public directory. External GitHub project links are not accepted. |
| checkedAt | No | Date of last community feedback, YYYY-MM-DD |
| reportedUses | No | Non-negative integer reported by the code owner; paired with capacity and date |
| reportedCapacity | No | Positive integer invite quota from the owner; NOT a live remaining count |
| usageReportedAt | Conditional | YYYY-MM-DD date of the owner's usage report; required with counts |
| featured | No | At most one owner-approved code; pin to homepage, not proof of redemption |
| ownerConfirmed | No | Boolean owner assertion, reserved for the featured `hoangsvit` code. Shows Verified Owner only, not redemption verification. |

Community statuses do **not** indicate official Muse verification:

- **unverified** — submitted but no feedback yet
- **reported-working** — reported working by a user, not a live official validation
- **reported-not-working** — reported failed by a user

Existing community codes were curated from earlier public submissions and retain their attributed contributor handles. Their listing does not imply a direct submission to this website, endorsement or successful redemption. Do not invent codes, treat copy events as redemptions, or promise rewards.

Usage figures must come from a dated report by the code owner, not from a copy button count. A displayed remaining count is a dated estimate, not a live balance. Future submissions should be reviewed through this repository's Issue Forms and relevant Muse information; public pages and catalog entries must not advertise unrelated GitHub repositories.

Run all checks listed in README.md before opening a PR. Keep PRs focused and preserve SEO text unless changes are requested.

## Community standards

Respect participants. Avoid spam, false reward promises, paid code offers, misleading brand association, or instructions to evade regional/account restrictions. Only Muse controls redemption eligibility and outcomes.


## Updating invitation availability

The owner's Muse Invite screen may show a total quota and used/remaining slots. Submit a [remaining-count update](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=update-count.yml), identifying the code and the dated values. Do not include private account details. A maintainer converts the report into a PR to update `reportedUses`, `reportedCapacity` and `usageReportedAt`. If only the remaining number is known, say so; do not invent a total.

The site displays a **dated self-reported snapshot**, calculated as `reportedCapacity - reportedUses`. It does not query Muse's live quota, and copying a code does not prove it was redeemed. Missing values display **Not reported**.

## Preview your PR

Open a focused PR targeting main. The validation job attaches an offline preview ZIP named muse-invite-hub-pr-preview-N (serve its extracted contents over HTTP, not via file://). After the PR-preview publisher is installed on main, the trusted Pages workflow posts a live link at https://muse.eplus.dev/pr-preview/pr-N/ **only after it confirms that the current PR revision and required assets are served correctly**.

Live previews contain only PR static site files and use a noindex tag. They are not public production updates. Previews are removed when the PR closes; a new push requires fresh validation before a replacement is advertised. Fork PRs are deliberately excluded from same-origin public publishing.
