# Contributing to Muse Invite Hub

Thanks for helping! **You can share an invite, report feedback or update a count without writing code.** Use the Share Code GitHub Issue Form **only for new invite codes**. You can submit up to **10 distinct new codes in one Issue**, separated by commas, spaces or newlines. They receive **separate catalog records in one review-only Draft PR**; per-code usage/quota fields must be blank for grouped submissions. If one code already exists, submit that code's update through its existing listing instead. Existing-code feedback and owner-count updates reuse the code’s canonical Issue through the website. UI and documentation improvements use Pull Requests.

[Homepage](https://muse.eplus.dev/) · [README](README.md) · [Visual contribution flow](docs/CONTRIBUTION_FLOW.md) · [Share code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml) · [Report feedback](https://muse.eplus.dev/#codes) · [Update count](https://muse.eplus.dev/#codes)

> **Privacy:** GitHub Issues, PRs and repository content are public. Never share passwords, OTPs, authentication codes, session tokens, cookies, private login or invite links, account identifiers, or screenshots containing sensitive details.

Each accepted code contribution is stored as an independent reviewed JSON record to reduce merge conflicts. The trusted build combines these with the historical catalog; the website still loads a single generated directory. Multiple submissions for the same code require review and are never silently merged.

## Share a public invite code

1. Open [Share a Muse invite code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml).
2. Select **GitHub (my own code)** if you own the code, or **Threads**, **X (Twitter)** or **Facebook** if you found a public code posted by another person.
3. Enter a public code (4–32 uppercase letters/digits/hyphens). For social submissions include the **original public post URL** (`threads.com/@user/post/ID`, `x.com/user/status/123456789` or `facebook.com/user/posts/ID`). A profile-only, Facebook share-shortlink or ambiguous URL is held for manual review. The handle in the post URL is the social source, **not** the reporter's GitHub account.
4. Enter quota figures **only for your own GitHub-owned code** from your Muse account; never infer them from a social post. Add optional non-sensitive notes.
5. Check both public sharing/privacy confirmations, then submit.

For GitHub-owned codes only: if your code is already listed under the same GitHub username, resubmitting an updated count (including a remaining-only number) can prepare an **update Draft PR**, not a duplicate listing. If a code is already listed from Threads, or someone files it under a different source, the bot will request manual review rather than replace the attribution or update the quota automatically. Existing listing IDs, contributor attribution and original listing dates are preserved. Numeric GitHub IDs help protect subsequent updates from username reuse. Actions checks the code and duplicates and can prepare an **automated Draft PR**. A maintainer reviews the data, marks the PR ready and merges it when appropriate. **An Issue never automatically publishes a code.** Community submissions start as `unverified`, and total quota alone never implies all invites remain.

## Optional maintainer-authorized auto-merge

Auto-merge is **off by default on every PR**. Passing tests never independently approves a community invite code.

After reviewing the real submitted code, source, attribution and diff, **@hoangsvit** can:

1. Ensure the PR is **Ready for review**, not Draft.
2. Approve the **current commit** in GitHub's PR review UI (when GitHub allows a review), **or** comment exactly `/automerge FULL_40_CHARACTER_HEAD_SHA` on the PR. A PR author who cannot approve their own PR can use the explicit SHA-bound comment.
3. Let the trusted workflow check the latest PR head, successful **Validate website and invite catalog** CI run, GitHub mergeability, and any outstanding `CHANGES_REQUESTED` reviews. It then squash-merges the PR and explicitly starts the trusted Pages deployment workflow.

The command is tied to the precise 40-character HEAD SHA shown under the PR's commits. A new commit requires **fresh approval or a fresh command**; there is no blanket approval for future commits. To cancel a prior authorization, comment `/automerge off`; a `do-not-merge` label also blocks automation.

The reviewer must still verify contributor consent and the original public source. A green test suite is **not** Muse redemption verification. The trusted workflow never executes unmerged PR code with write-scoped permissions. GitHub's native repository-level Auto-merge switch is currently disabled; this workflow does not depend on that setting. The automatic merge is **not** allowed to bypass protected-branch requirements.

## Report code feedback

1. Find your code on [Muse Invite Hub](https://muse.eplus.dev/#codes) and click **Give feedback**, **Worked for me** or **Didn't work**. These actions open an editable report dialog tied to the **canonical GitHub Issue** for that code. Do not open a second report Issue.
2. Review the prefilled code, outcome and date; click **Copy comment**, then **Open Issue #N** to paste and post it. GitHub does not support automatically prefilling a comment in an existing Issue. No report is submitted by merely clicking the link.
3. If the original Issue was closed after publication, the trusted bot reopens it **after** a human posts the comment. Structured accepted/rejected reports can generate a **review-only Draft PR** from the comment. Informal comments and other observations remain for manual review. Nothing automatically changes the published code status.

Existing issues remain associated with their original code even after merging. For manually added or imported codes with no local contributor Issue, the trusted production deployment creates one stable tracking Issue. Any status or quota changes still require a separate, reviewed catalog update. Neither comments nor the bot prove Muse redemption, live availability or eligibility.

## Update remaining invites

If you own a listed GitHub-source invite code, find it in [the directory](https://muse.eplus.dev/#codes), click **Update count**, and review the prepared owner-report comment. Enter numbers shown in **your Muse Invite screen**, check the explicit ownership confirmation, click **Copy comment**, and post it on **the code's existing Issue**. The bot verifies your GitHub account against the original listed owner and proposes a **Draft PR** only if the figures are consistent. This does **not** create another Issue.

For Threads, X or Facebook source listings, a GitHub username alone cannot establish ownership; please add evidence as a comment on the linked code Issue for manual maintainer review. The old Update count Issue Form is retained only for backward compatibility, not the preferred workflow.

| Example | Quantity |
| --- | ---: |
| Total invites | 30 |
| Remaining invites | 3 |
| Used invites (30 − 3) | 27 |

If only a remaining number is shown, report it without inventing the total. The public catalog stores either the complete `reportedCapacity` + `reportedUses` + `usageReportedAt` snapshot, **or** `reportedRemaining` + `usageReportedAt` when only the remaining count is known. The latter displays the remaining number without inventing a total. The trusted workflow proposes an automatic **Draft PR** only when the reporter matches the listed GitHub code owner and the figures are consistent. For Threads, X or Facebook listings, GitHub identity alone does not prove code ownership and quota changes require manual verification. A maintainer must review and merge the proposal before publication.

Amounts are **dated self-reported snapshots**, not live Muse availability. Copying a code is not redeeming it. Missing or incomplete values display **Not reported**.

## Automatic Issue-to-Draft-PR

New-code Issue Forms trigger [Issue to Draft PR](.github/workflows/issue-to-pr.yml) when opened or edited. Reopening an existing code Issue does **not** rerun the original code-submission bot. It uses trusted source code on `main`, treats submitted text as untrusted data, checks duplicates, and creates a separate branch named `auto/issue-<NUMBER>-<TYPE>`. It proposes a change **only to `data/invites.json`** and opens a **Draft PR**. The workflow comments on the originating Issue with the PR link or the reason the report requires manual review. **The Issue stays open during Draft PR review.** Generated PRs do not include GitHub's `Closes #` keywords, which could close an Issue before the acceptance comment is posted.

**Existing code comments use a separate workflow:** [Reopen Code Feedback Issue](.github/workflows/reopen-code-feedback.yml) processes a human comment on the mapped original Issue. After reopening a closed Issue for review, it parses only explicitly structured redemption reports or confirmed owner quota updates. Eligible reports become independent, review-only Draft PRs from current `main`, one branch per comment; other messages stay for manual review. This workflow never auto-merges or promotes community feedback into official Muse verification. The original code Issue remains the discussion thread and is not auto-closed after a feedback review.

New feedback and count forms require the listing platform. The Issue bot checks the selected platform against the code's cataloged source; if it conflicts, it requests manual review rather than changing the other platform's listing. Old Issues without the field remain backward compatible.

Threads, X and Facebook Issues with a valid-looking **original post permalink** may propose an **unverified** Draft PR; maintainers must confirm the post actually contains the code and credits the correct author. Profile-only, Facebook share-shortlink, malformed, duplicated or ambiguous sources require manual review. Issue reporters are never automatically treated as owners of other platforms' accounts.

No Issue content is published automatically. Draft PRs created by this workflow are **not included in publicly hosted PR previews** until a maintainer marks them ready for review. Once ready, maintainers inspect the proposal and CI/preview, then merge to `main` to deploy. After successful GitHub Pages deployment, trusted automation checks that the merged PR is included in the deployed commit and that the code's production detail is accessible. It posts a comment linking to **https://muse.eplus.dev/codes/CODE/** on the original Issue **before** closing it. If deployment, page verification or commenting fails, the Issue remains open for a later successful deployment. Repeated runs never post duplicate acceptance comments. Repeated Issues or conflicting values do not create duplicate proposals.

**One-time setup:** if GitHub denies PR creation, enable **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** (subject to organization policy). No custom token is required. Retry using **Actions → Issue to Draft PR → Run workflow** and enter the original Issue number. The automation never force-pushes or auto-merges.

## Contribute code or documentation

1. Review [AGENTS.md](AGENTS.md), [open PRs](https://github.com/ePlus-DEV/muse-invite-hub/pulls) and the relevant code before starting.
2. Branch from the latest `main` (or fork the repo and create a branch from its `main`). Use one branch per independent change.
3. Make a focused edit, preserve existing SEO text/canonical unless explicitly authorized, and run the checks below.
4. Open a PR **targeting `main`**, describe what changed, link related Issues, and note any data, SEO or UI impact.
5. Review the CI results, relevant pages and Preview if eligible. A maintainer merges approved changes. **Only a merge to `main` publishes production.**

Do not directly push to `main`, force-push rewritten contributor history, base unrelated work on an unmerged PR, invent invitation details, or add promotional links to unrelated GitHub repositories.

### Run locally

You need **Node.js 24** only. The included local static server uses Node.js built-ins; no Python, npm install or backend is required.

~~~sh
node scripts/serve.mjs
~~~

Open http://localhost:8000/. Use HTTP instead of `file://`. A plain source checkout serves the homepage; detail pages are generated during deployment.

Run:

~~~sh
node scripts/validate.mjs
node scripts/audit-links.mjs
node --test scripts/serve.test.mjs
node --test scripts/validate.test.mjs scripts/audit-links.test.mjs scripts/preview.test.mjs scripts/site-pages.test.mjs
node --check assets/app.js
node --check assets/detail.js
node --check scripts/issue-to-pr.mjs
node --test scripts/issue-to-pr.test.mjs scripts/close-accepted-issues.test.mjs
~~~

For UI changes, also inspect mobile/desktop, filtering, sorting, copy, error states and affected detail pages. The PR workflow attaches a full `muse-invite-hub-pr-preview-N` artifact for **same-repository PRs** after validation; extract it, run `node scripts/serve.mjs /path/to/extracted-preview 8000` from the repository root, and open `http://localhost:8000/codes/<CODE>/`.

Same-repository non-Draft PRs with green CI and a clean merge can receive a verified public preview URL at `https://muse.eplus.dev/pr-preview/pr-N/` and detail pages below `/codes/<CODE>/`. The deployment bot checks the actual commit and assets before posting a link. **Fork PRs get CI, but not automatically a hosted same-origin preview or the same-repository artifact.** All previews use `noindex` and do not alter production. After a PR preview is removed, its Home and code-detail paths navigate to the production equivalents using the trusted root `404.html` (or production Home for PR-only codes). This client-side fallback does not change GitHub Pages' initial HTTP 404 status.

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
| `sourceUrl` | Optional public HTTPS context. Social attribution requires a valid Threads, X/Twitter or Facebook profile/post permalink, with no `submittedBy`/`submittedById`. Use direct original posts for automatic Issue proposals; profiles or unsupported Facebook shares require manual review. No private data or unrelated GitHub repositories |
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
