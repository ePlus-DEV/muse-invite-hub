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
| sourceUrl | No | Public HTTPS URL for supporting context |
| checkedAt | No | Date of last community feedback, YYYY-MM-DD |

Community statuses do **not** indicate official Muse verification:

- **unverified** — submitted but no feedback yet
- **reported-working** — reported working by a user, not a live official validation
- **reported-not-working** — reported failed by a user

The catalog starts empty. Do not invent a working code, claim that copy clicks are redemptions, or promise rewards. Use unverified when in doubt.

Run all checks listed in README.md before opening a PR. Keep PRs focused and preserve SEO text unless changes are requested.

## Community standards

Respect participants. Avoid spam, false reward promises, paid code offers, misleading brand association, or instructions to evade regional/account restrictions. Only Muse controls redemption eligibility and outcomes.
