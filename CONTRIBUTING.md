# Contributing to Muse Invite Hub

Thanks for helping! **You can share an invite, report feedback or update a count without writing code.** Public GitHub Issue Forms are the preferred path for community information; UI and documentation improvements use Pull Requests.

[Homepage](https://muse.eplus.dev/) · [README](README.md) · [Share code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml) · [Report feedback](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml) · [Update count](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=update-count.yml)

> **Privacy:** GitHub Issues, PRs and repository content are public. Never share passwords, OTPs, authentication codes, session tokens, cookies, private login or invite links, account identifiers, or screenshots containing sensitive details.

## Share a public invite code

1. Open [Share a Muse invite code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml).
2. Enter a **public** code you own or are authorized to share. The catalog accepts 4–32 uppercase letters, digits or hyphens.
3. Add any useful non-sensitive notes or public context. If your account shows an invite total and used count, you may supply the **actual** values; never guess.
4. Check both permission/privacy confirmations, then submit.

If your code is already listed under the same GitHub username, resubmitting an updated count (including a remaining-only number) can prepare an **update Draft PR**, not a duplicate listing. Existing listing IDs, contributor attribution and original listing dates are preserved. Numeric GitHub IDs help protect subsequent updates from username reuse. Actions checks the code and duplicates and can prepare an **automated Draft PR**. A maintainer reviews the data, marks the PR ready and merges it when appropriate. **An Issue never automatically publishes a code.** Community submissions start as `unverified`, and total quota alone never implies all invites remain.

## Report code feedback

1. Open [Report a code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=report-code.yml).
2. Supply the exact code and select accepted, rejected, exhausted, no redeem option, duplicate, or other.
3. Include the date and non-sensitive error text or context if helpful.

One attempt is **community feedback**, not proof that every account or region will behave the same way. Clear accepted/rejected feedback can produce an automated **Draft PR** with a community-reported status and date; ambiguous feedback stays for manual triage. Only a reviewed and merged PR should change `status` or `checkedAt`.

## Update remaining invites

If you own the public invite, use [Update invite count](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=update-count.yml). Report the date, code, and only numbers actually shown in **your Muse Invite screen**.

| Example | Quantity |
| --- | ---: |
| Total invites | 30 |
| Remaining invites | 3 |
| Used invites (30 − 3) | 27 |

If only a remaining number is shown, report it without inventing the total. The public catalog stores either the complete `reportedCapacity` + `reportedUses` + `usageReportedAt` snapshot, **or** `reportedRemaining` + `usageReportedAt` when only the remaining count is known. The latter displays the remaining number without inventing a total. The trusted workflow proposes a **Draft PR** only when the reporter matches the listed code owner and the figures are consistent. A maintainer must review and merge the proposal before publication.

Amounts are **dated self-reported snapshots**, not live Muse availability. Copying a code is not redeeming it. Missing or incomplete values display **Not reported**.

## Automatic Issue-to-Draft-PR

Supported Issue Forms trigger [Issue to Draft PR](.github/workflows/issue-to-pr.yml) when opened, edited or reopened. It uses trusted source code on `main`, treats submitted text as untrusted data, checks duplicates, and creates a separate branch named `auto/issue-<NUMBER>-<TYPE>`. It proposes a change **only to `data/invites.json`** and opens a **Draft PR**. The workflow comments on the originating Issue with the PR link or the reason the report requires manual review.

No Issue content is published automatically. Draft PRs created by this workflow are **not included in publicly hosted PR previews** until a maintainer marks them ready for review. Once ready, maintainers inspect the proposal and CI/preview, then merge to `main` to deploy. Repeated Issues or conflicting values do not create duplicate proposals.

**One-time setup:** if GitHub denies PR creation, enable **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** (subject to organization policy). No custom token is required. Retry using **Actions → Issue to Draft PR → Run workflow** and enter the original Issue number. The automation never force-pushes or auto-merges.

## Contribute code or documentation

1. Review [AGENTS.md](AGENTS.md), [open PRs](https://github.com/ePlus-DEV/muse-invite-hub/pulls) and the relevant code before starting.
2. Branch from the latest `main` (or fork the repo and create a branch from its `main`). Use one branch per independent change.
3. Make a focused edit, preserve existing SEO text/canonical unless explicitly authorized, and run the checks below.
4. Open a PR **targeting `main`**, describe what changed, link related Issues, and note any data, SEO or UI impact.
5. Review the CI results, relevant pages and Preview if eligible. A maintainer merges approved changes. **Only a merge to `main` publishes production.**

Do not directly push to `main`, force-push rewritten contributor history, base unrelated work on an unmerged PR, invent invitation details, or add promotional links to unrelated GitHub repositories.

### Run locally

You need **Node.js 24** and Python (or another static HTTP server). No package install or backend is needed.

~~~sh
python -m http.server 8000
~~~

Open http://localhost:8000/. Use HTTP instead of `file://`. A plain source checkout serves the homepage; detail pages are generated during deployment.

Run:

~~~sh
node scripts/validate.mjs
node scripts/audit-links.mjs
node --test scripts/validate.test.mjs scripts/audit-links.test.mjs scripts/preview.test.mjs scripts/site-pages.test.mjs
node --check assets/app.js
node --check assets/detail.js
node --check scripts/issue-to-pr.mjs
node --test scripts/issue-to-pr.test.mjs
~~~

For UI changes, also inspect mobile/desktop, filtering, sorting, copy, error states and affected detail pages. The PR workflow attaches a full `muse-invite-hub-pr-preview-N` artifact for **same-repository PRs** after validation; extract it, serve the folder over HTTP and open `http://localhost:8000/codes/<CODE>/`.

Same-repository non-Draft PRs with green CI and a clean merge can receive a verified public preview URL at `https://muse.eplus.dev/pr-preview/pr-N/` and detail pages below `/codes/<CODE>/`. The deployment bot checks the actual commit and assets before posting a link. **Fork PRs get CI, but not automatically a hosted same-origin preview or the same-repository artifact.** All previews use `noindex` and do not alter production.

## Invite catalog format

The catalog is [`data/invites.json`](data/invites.json). All changes must pass `node scripts/validate.mjs`.

**Illustrative placeholder — not an actual invite, do not publish it:**

~~~json
{
  "id": "community-example",
  "code": "EXAMPLE1",
  "status": "unverified",
  "addedAt": "2026-11-11",
  "submittedBy": "example-user",
  "note": "Community-reported; redemption not independently verified."
}
~~~

Use the real code, authorized contributor handle and actual addition date, never placeholder values.

| Field | Rules |
| --- | --- |
| `id` | Required unique lowercase slug (letters, digits, internal hyphens) |
| `code` | Required unique 4–32 uppercase letters, numbers or hyphens |
| `status` | Required `unverified`, `reported-working`, or `reported-not-working` |
| `addedAt` | Required real date in `YYYY-MM-DD` |
| `submittedBy` | Optional public GitHub username, with permission to attribute |
| `note` | Optional plain-text note, max 180 characters |
| `checkedAt` | Optional date of last reviewed community feedback |
| `reportedUses` / `reportedCapacity` / `usageReportedAt` | Optional full snapshot: used ≥ 0, capacity 1–1000, used ≤ capacity, real date `YYYY-MM-DD` |
| `reportedRemaining` / `usageReportedAt` | Alternative remaining-only snapshot: 0–1000, real date; cannot mix with full snapshot |
| `submittedById` | Optional positive GitHub numeric account ID recorded on authorized owner updates; protects against future username reuse |
| `sourceUrl` | Optional **public** HTTPS context link; not displayed on cards but visible in JSON/Git history. No private data or unrelated GitHub repository URLs |
| `featured` | Optional boolean; at most one featured code |
| `ownerConfirmed` | Optional boolean; `true` reserved for featured owner code submitted by `hoangsvit`, not redemption verification |

`unverified` means there is no reviewed confirmation of redemption; `reported-working` and `reported-not-working` are community feedback statuses, **not official Muse validation**.

Historical contributor handles are kept for attribution. Listings do not mean these people submitted directly to this site, or that Muse endorsed a code.

## Maintainer review checklist

1. Check for duplicate codes, related Issues and PRs.
2. Check authorized public submission, status report or owner-reported quota; do not infer reward amounts or live validity.
3. Edit only reviewed catalog or project files and preserve site SEO unless deliberately approved.
4. Run validation, link audit and tests; check the generated preview on relevant URLs.
5. Merge the approved PR into `main`. GitHub Pages then deploys production from trusted source.

Issue Forms are **not auto-publication**. Never auto-merge arbitrary user-submitted catalog data.

## Community and security

Be respectful. No spam, selling invitations, false reward promises, credential sharing, misleading affiliation claims, or instructions to bypass eligibility and regional restrictions. Only Muse can determine redemption outcomes and current rules.

For security vulnerabilities, follow [SECURITY.md](SECURITY.md), not public Issue comments containing secrets.

[Back to README](README.md)
