# Contributing to Muse Invite Hub

Thanks for helping! **You can share an invite, report feedback or update a count without writing code.** Use the Share Code GitHub Issue Form **only for new invite codes**. You can submit up to **10 distinct new codes in one Issue**, separated by commas, spaces or newlines. They receive **separate catalog records in one PR**: eligible new GitHub-owned codes auto-publish after validation, while strict, single-code public social-post submissions can also auto-publish as unverified reports; ambiguous social sources stay review-only Draft PRs. For your own new GitHub codes, optionally enter one remaining count (0–30) per code, in the same order, separated by commas; grouped quota proposals require a review-only Draft PR. Shared quotas, legacy grouped total/used values and social-source quota claims are not accepted. If one code already exists, submit that code's update through its existing listing instead. Existing-code feedback and owner-count updates reuse the code’s canonical Issue through the website. UI and documentation improvements use Pull Requests.

[Homepage](https://muse.eplus.dev/) · [README](README.md) · [Visual contribution flow](docs/CONTRIBUTION_FLOW.md) · [Share code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml) · [Report feedback](https://muse.eplus.dev/#codes) · [Update count](https://muse.eplus.dev/#codes)

> **Privacy:** GitHub Issues, PRs and repository content are public. Never share passwords, OTPs, authentication codes, session tokens, cookies, private login or invite links, account identifiers, or screenshots containing sensitive details.

Each accepted code contribution is stored as an independent reviewed JSON record to reduce merge conflicts. The trusted build combines these with the historical catalog; the website still loads a single generated directory. Multiple submissions for the same code require review and are never silently merged.

## Share a public invite code

1. Open [Share a Muse invite code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml).
2. Select **GitHub (my own code)** if you own the code, or **Threads**, **X (Twitter)** or **Facebook** if you found a public code posted by another person. **Telegram** is also supported as a consented community source through the private Telegram bot; valid new codes can auto-publish as unverified.
3. Enter a public code (exactly 6 letters (A–Z) or digits (0–9), without hyphens (lowercase is normalized)). For social submissions include the **original public post URL** (`threads.com/@user/post/ID`, `x.com/user/status/123456789` or `facebook.com/user/posts/ID`). Facebook group posts, permalinks, share links, profiles and other HTTPS Facebook references are accepted; ambiguous or group links create review-only Draft PRs without claiming authorship. The handle in the post URL is the social source, **not** the reporter's GitHub account.
4. Enter quota figures **only for your own GitHub-owned code** from your Muse account; never infer them from a social post. Add optional non-sensitive notes.
5. Check both public sharing/privacy confirmations, then submit.

For GitHub-owned codes only: if your code is already listed under the same GitHub username, resubmitting an updated count (including a remaining-only number) can prepare an **update Draft PR**, not a duplicate listing. If a code is already listed from Threads, or someone files it under a different source, the bot will request manual review rather than replace the attribution or update the quota automatically. Existing listing IDs, contributor attribution and original listing dates are preserved. Numeric GitHub IDs help protect subsequent updates from username reuse. Actions checks the code and duplicates. **For a new GitHub-owned code with both confirmations checked**, the bot creates a Ready PR and can automatically merge it **only after** CI passes and a trusted workflow re-checks the current Issue, all generated JSON files and duplicate codes. Accepted codes are shown as `unverified` (community-submitted, not redemption-verified). **Strict single-code public Threads/X/Facebook posts and valid bot-authored Telegram new codes** can also auto-publish as unverified community reports. Existing-code changes, incomplete/ambiguous Issues, untrusted social source claims and feedback still create review-only Draft PRs. Total quota alone never implies all invites remain.

**Telegram submissions:** the native Telegram bot requires a public `@username` obtained from the Telegram update and explicit consent before the username/profile appears in a public GitHub Issue. If someone manually selects Telegram in the GitHub Issue Form but supplies no Telegram username, link or public source, the trusted parser attributes the proposal only to the GitHub Issue reporter (not a verified owner) and creates a review-only Draft PR. It does not rewrite the original source selection or make this fallback eligible for auto-merge. Explicit human-created Telegram attribution claims still require manual source review. The Issue uses the same `[Invite] CODE` title, all Share Code headings, and the same consent checklist as other platforms. The internal Telegram marker—not a different Issue format—prevents GitHub-owner misattribution. The GitHub author is the bot, not the contributor. The Issue-to-PR workflow automatically proposes a **Ready PR** for a valid new-code Telegram bot submission; trusted automation rechecks the original consent, attribution, source, exact record, duplicates and current-head CI before merging. After successful publication, an accepted Telegram code is stored with a validated `https://t.me/username` `sourceUrl` and the original GitHub feedback Issue number; it remains `unverified`. A profile URL is not proof of ownership or redemption. A public Telegram post link can also be retained after verification. Private numeric user/chat IDs are never written into the catalog. Only valid, consented **new-code** Telegram bot submissions may auto-merge as unverified. Telegram quota, feedback, existing-code updates and mismatched identity never auto-merge.

## Conditional auto-merge policy

There are **four different routes**. Passing CI does **not** prove that a code works in Muse.

| PR type | Default behavior |
| --- | --- |
| **New, self-reported GitHub invite code** from a complete Issue, not yet in the catalog | **Automatic:** trusted Issue bot makes a Ready PR, then trusted automation checks consent, source, original Issue, exact new JSON record(s), duplicates, current-head CI and mergeability before merging. Listing remains `unverified`. |
| **New code cited from a public Threads, X or Facebook post** | **Automatic as unverified report:** only one new code, a strict original HTTPS post permalink on the selected platform, both contributor checkboxes, no owner-count claims, no duplicate, a bot-only one-file diff and passing exact-head CI. No promise that the URL still works, the post really contains the code or Muse accepts it. |
| **New code submitted through the Telegram bot** | **Automatic as unverified community report:** requires public @username plus explicit consent, matching bot Issue marker/code/author/profile, exactly one new code, no owner-count claims, exact bot-generated JSON, current-head green CI and trusted merge gate. A Telegram profile does not verify ownership, code validity or redemption. |
| **Documentation-only PR authored by @hoangsvit** | **Automatic** after green CI if Ready, only `README.md`, `CONTRIBUTING.md` or Markdown under `docs/` (1–15 changed files, no deletion/rename/mixed code). |
| **Existing-code, ambiguous social-source, feedback, quota, code, UI, workflow or other PRs** | **Manual review:** keep generated community proposals in Draft until reviewed; `@hoangsvit` may authorize merge of the current Ready PR head. |

### Real ePlus Bot reviews (same account as Free Tier Hub)

Muse Invite Hub reuses the **existing GitHub account `@eplus-bot`** and repository Actions secret `EPLUS_BOT_TOKEN`, like Free Tier Hub. New Issue-to-PR proposals are now authored by this real bot identity rather than `github-actions[bot]`; this allows ordinary PR CI to trigger without a maintainer's workflow-run approval. **The bot cannot approve its own PR.** Independently verified new GitHub, strict public-post and Telegram bot invite JSON PRs can be merged by the trusted main-branch gate after original Issue, exact diff, duplicate, current-head CI and GitHub protection checks. Legacy PRs authored by `github-actions[bot]` may still receive real SHA-bound `APPROVED` reviews from `@eplus-bot`. No new GitHub App is needed. Auto-publication never proves the code works in Muse.

**One-time setup:** Open Muse repository **Settings → Secrets and variables → Actions**, and create a secret named `EPLUS_BOT_TOKEN` using the existing eplus-bot account's authorized token. Alternatively give this repository access to an **organization** secret of that name. Secrets owned by Free Tier Hub are not automatically shared with Muse. The account must have permission to review PRs here. Never paste the token into Issues, commits or CI output. No GitHub App Client ID or private key is required.

After configuration, `Issue to Draft PR` uses `@eplus-bot` to create PRs, and `Conditional PR auto-merge` (every 15 minutes plus event triggers) reconciles safe branches, dispatches CI and conditionally merges verified new invites. The bot submits real APPROVED reviews only for eligible PRs created by `github-actions[bot]` (never its own PRs). Missing or invalid credentials fail closed at proposal creation. Existing-code updates, ambiguous or multi-code social sources, owner quotas, feedback and changes to application code/workflows remain manual. A user-submitted valid post URL is a reference only, not independent verification; contributors are responsible for accurate submissions and visitors should verify codes before using them.

A repository OWNER/MEMBER/COLLABORATOR can ask for a real review on a green **Ready** PR by commenting exactly `@eplus-bot review`. This command cannot approve a Draft, blocked or eplus-bot-authored PR, and never by itself authorizes automatic merging of arbitrary code/workflow changes.
For the manual route, after reviewing the source and diff, @hoangsvit may approve the current HEAD in GitHub (where possible) **or** comment `/automerge FULL_40_CHARACTER_HEAD_SHA` on the PR. A new commit invalidates that authorization. The trusted workflow checks current-head validation, GitHub mergeability and the up-to-date `main` branch, then uses squash merge and explicitly dispatches the trusted Pages deployment.

**All four routes can be blocked:** `do-not-merge` label, `/automerge off` by @hoangsvit, Draft status, an unresolved `CHANGES_REQUESTED` review, failed or in-progress CI, merge conflict, or a branch behind `main`. Do not use auto-merge to bypass branch protection. GitHub's built-in repository-level **Allow auto-merge** setting is separate and currently disabled; this workflow implements the conditional policy without a personal access token.

For the GitHub Issue route, the submitting account is recorded as a community reporter, **not independently proven to own the code**. Auto-publication is not live redemption validation. Publish newly submitted strict social post permalinks only with an explicit unverified disclaimer; do not automatically modify existing codes or trust reported social ownership/quotas.

## Report code feedback

1. Find your code on [Muse Invite Hub](https://muse.eplus.dev/#codes) and click **Give feedback**, **Worked for me** or **Didn't work**. These actions open an editable report dialog tied to the **canonical GitHub Issue** for that code. Do not open a second report Issue.
2. Review the prefilled code, outcome and date; click **Copy comment**, then **Open Issue #N** to paste and post it. GitHub does not support automatically prefilling a comment in an existing Issue. No report is submitted by merely clicking the link.
3. If the original Issue was closed after publication, the trusted bot reopens it **after** a human posts the comment. Structured accepted/rejected reports can generate a **review-only Draft PR** from the comment. Informal comments and other observations remain for manual review. Nothing automatically changes the published code status.

Existing issues remain associated with their original code even after merging. For manually added or imported codes with no local contributor Issue, the trusted production deployment creates one stable tracking Issue. Any status or quota changes still require a separate, reviewed catalog update. Neither comments nor the bot prove Muse redemption, live availability or eligibility.

## Update remaining invites

If you own a listed GitHub-source invite code, find it in [the directory](https://muse.eplus.dev/#codes), click **Update count**, and review the prepared owner-report comment. Enter numbers shown in **your Muse Invite screen**, check the explicit ownership confirmation, click **Copy comment**, and post it on **the code's existing Issue**. The bot verifies your GitHub account against the original listed owner and proposes a **Draft PR** only if the figures are consistent. This does **not** create another Issue.

For Threads, X, Facebook or Telegram source listings, a GitHub username alone cannot establish ownership; please add evidence as a comment on the linked code Issue for manual maintainer review. The old Update count Issue Form is retained only for backward compatibility, not the preferred workflow.

| Example | Quantity |
| --- | ---: |
| Remaining invites (the only field to enter) | 3 |
| Previous reviewed total (display only, if available) | 30 |
| Calculated used = previous total − remaining | 27 |

The project supports **at most 30 invite slots per code**, not a guaranteed allocation or balance. Valid total values are **1–30**, with remaining and used in **0–30**; used cannot exceed the reported total. A previously reported smaller total (for example 20) remains valid. If only remaining is shown, do not invent the total. The public catalog stores either the complete `reportedCapacity` + `reportedUses` + `usageReportedAt` snapshot, **or** `reportedRemaining` + `usageReportedAt` when only the remaining count is known. The latter displays the remaining number without inventing a total. The Update count form and new Share Code Issue Form expose only **Remaining invites (0–30)** for quota entry; Used and Total are not user inputs. If the same verified GitHub owner previously had a complete, dated reviewed total, the system retains that actual total and calculates used = total − remaining for a review-only proposal. If no reviewed total exists, only the dated remaining count is stored; used remains unknown. Historical Issue comments containing Used/Total remain supported. This does not mean the total was re-confirmed. The trusted workflow proposes an automatic **Draft PR** only when the reporter matches the listed GitHub code owner and the figures are consistent. For Threads, X or Facebook listings, GitHub identity alone does not prove code ownership and quota changes require manual verification. A maintainer must review and merge the proposal before publication.

Amounts are **dated self-reported snapshots**, not live Muse availability. Copying a code is not redeeming it. The published JSON contains a separate `quotaDisplay` projection. Codes **without any count report** display **30/30 · default (unconfirmed)** according to site policy, with **No report** for the date. This is NOT verified availability: the `reported*` values and report date stay absent. `quotaDisplay.used` is `0` by default, or `30 − reported remaining` when only remaining was reported; it is explicitly a policy estimate rather than an owner-reported used count. Codes with accepted dated counts display their reported figures instead, including smaller actual totals. Invalid/incomplete reports remain **Not reported** rather than being silently replaced.

## Automatic Issue-to-PR and publication

**New invite codes:** the [Issue to Draft PR workflow](.github/workflows/issue-to-pr.yml) also creates **Ready PRs** for eligible new GitHub-owned, strict public-post, and bot-authored Telegram codes despite its historical name. It executes trusted `main` code on Issue creation, edits or reopening; validates the two contributor confirmations, source selection and code format; checks the catalog; then writes only independent `data/invite-records/<id>.json` files on a dedicated `auto/issue-<NUMBER>-invite` branch. A single Issue may contain **1–10 distinct new codes**; grouped submissions cannot share quota figures. GitHub-owned new codes may include an ordered list of per-code remaining counts, reviewed in a Draft PR. The bot comments with a PR link or clear correction instructions.

**Automatic GitHub-code path:** a complete, new `GitHub (my own code)` submission gets a **Ready PR**. [Conditional PR auto-merge](.github/workflows/auto-merge.yml) independently re-reads the original open Issue, validates the contributor's actual checklist, compares **every changed JSON file** against deterministic expected records from the current catalog and verifies bot provenance. No duplicate code or code/update/extra-file change qualifies. It then requires successful validation for the exact PR head, an up-to-date `main`, clean mergeability and no blocking review/label/command before squash-merging. Codes publish as **`unverified`**, not validated by Muse.

**Review-only path:** new codes sourced from Threads, X or Facebook require an original public post link and a **Draft PR** for human source/attribution review. Existing-code updates, quota/feedback reports, ownership mismatches, ambiguous/invalid sources and duplicate codes must **not** use new-code auto-merge. Invalid or missing contributor confirmations never authorize publication: keep the original Issue open and guide the contributor to edit it; do not tick the checkboxes for them or require a duplicate Issue.

**Canonical feedback comments:** [Reopen Code Feedback Issue](.github/workflows/reopen-code-feedback.yml) handles human comments on each published code's mapped Issue. It can reopen a closed thread and propose independent review-only Draft PRs for correctly structured usage, worked/not-working reports and GitHub-owner quota changes. Ordinary discussion stays in the existing Issue; posting a comment is not automatic status verification. Older standalone count/feedback Issue Forms remain accepted for compatibility and must match the published source platform.

**Deployment and closure:** only merged `main` is deployed. The trusted [Pages workflow](.github/workflows/pages.yml) verifies the live catalog, code detail and merged commit, then [posts the canonical detail link before closing](scripts/close-accepted-issues.mjs) an accepted new-code/legacy report Issue. For reviewed **GitHub-owner quota updates originating in canonical Issue comments**, the separate [post-deploy count reconciler](scripts/close-published-comment-counts.mjs) verifies exact source/comment identity, PR contents, live dated counts and the absence of newer human feedback; it posts a PR-specific completion comment **before closing** that resolved Issue. If deployment, validation or posting fails, leave the Issue open. New feedback on a closed canonical thread may reopen it; older completed PRs cannot re-close a newer pending discussion. Feedback-only comments remain manual-review discussions and are not automatically closed.

**Setup and recovery:** GitHub Actions needs permission to create PRs (**Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**, when permitted by organization policy). If the bot could not create a PR, rerun **Actions → Issue to Draft PR → Run workflow** for the **original Issue number**. Because PRs made with `GITHUB_TOKEN` may not trigger standard PR workflows, the bot explicitly dispatches validation. A trusted auto-merge also explicitly dispatches Pages; no personal token is needed. Never force-push the user's Issue/branch history.

For the exact decision diagram and different Issue closure rules, see [Contribution flow](docs/CONTRIBUTION_FLOW.md).

## Contribute code or documentation

1. Review [AGENTS.md](AGENTS.md), [open PRs](https://github.com/ePlus-DEV/muse-invite-hub/pulls) and the relevant code before starting.
2. Branch from the latest `main` (or fork the repo and create a branch from its `main`). Use one branch per independent change.
3. Make a focused edit, preserve existing SEO text/canonical unless explicitly authorized, and run the checks below.
4. Open a PR **targeting `main`**, describe what changed, link related Issues, and note any data, SEO or UI impact.
5. Review the CI results, relevant pages and Preview if eligible. A maintainer reviews sensitive changes; authorized Ready PRs and eligible low-risk documentation PRs may merge through the trusted conditional workflow. **Only a merge to `main` publishes production.**

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
node --test scripts/issue-to-pr.test.mjs scripts/close-accepted-issues.test.mjs scripts/close-published-comment-counts.test.mjs
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
| `code` | Required unique 6-character uppercase alphanumeric string (`^[A-Z0-9]{6}# Contributing to Muse Invite Hub

Thanks for helping! **You can share an invite, report feedback or update a count without writing code.** Use the Share Code GitHub Issue Form **only for new invite codes**. You can submit up to **10 distinct new codes in one Issue**, separated by commas, spaces or newlines. They receive **separate catalog records in one PR**: eligible new GitHub-owned codes auto-publish after validation, while strict, single-code public social-post submissions can also auto-publish as unverified reports; ambiguous social sources stay review-only Draft PRs. Per-code usage/quota fields must be blank for grouped submissions. If one code already exists, submit that code's update through its existing listing instead. Existing-code feedback and owner-count updates reuse the code’s canonical Issue through the website. UI and documentation improvements use Pull Requests.

[Homepage](https://muse.eplus.dev/) · [README](README.md) · [Visual contribution flow](docs/CONTRIBUTION_FLOW.md) · [Share code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml) · [Report feedback](https://muse.eplus.dev/#codes) · [Update count](https://muse.eplus.dev/#codes)

> **Privacy:** GitHub Issues, PRs and repository content are public. Never share passwords, OTPs, authentication codes, session tokens, cookies, private login or invite links, account identifiers, or screenshots containing sensitive details.

Each accepted code contribution is stored as an independent reviewed JSON record to reduce merge conflicts. The trusted build combines these with the historical catalog; the website still loads a single generated directory. Multiple submissions for the same code require review and are never silently merged.

## Share a public invite code

1. Open [Share a Muse invite code](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml).
2. Select **GitHub (my own code)** if you own the code, or **Threads**, **X (Twitter)** or **Facebook** if you found a public code posted by another person.
3. Enter a public code (exactly 6 letters (A–Z) or digits (0–9), without hyphens (lowercase is normalized)). For social submissions include the **original public post URL** (`threads.com/@user/post/ID`, `x.com/user/status/123456789` or `facebook.com/user/posts/ID`). Facebook group, share, profile and other ambiguous references create review-only Draft PRs. The handle in the post URL is the social source, **not** the reporter's GitHub account.
4. Enter quota figures **only for your own GitHub-owned code** from your Muse account; never infer them from a social post. Add optional non-sensitive notes.
5. Check both public sharing/privacy confirmations, then submit.

For GitHub-owned codes only: if your code is already listed under the same GitHub username, resubmitting an updated count (including a remaining-only number) can prepare an **update Draft PR**, not a duplicate listing. If a code is already listed from Threads, or someone files it under a different source, the bot will request manual review rather than replace the attribution or update the quota automatically. Existing listing IDs, contributor attribution and original listing dates are preserved. Numeric GitHub IDs help protect subsequent updates from username reuse. Actions checks the code and duplicates. **For a new GitHub-owned code with both confirmations checked**, the bot creates a Ready PR and can automatically merge it **only after** CI passes and a trusted workflow re-checks the current Issue, all generated JSON files and duplicate codes. Accepted codes are shown as `unverified` (community-submitted, not redemption-verified). **Strict single-code public Threads/X/Facebook posts and valid bot-authored Telegram new codes** can also auto-publish as unverified community reports. Existing-code changes, incomplete/ambiguous Issues, untrusted social source claims and feedback still create review-only Draft PRs. Total quota alone never implies all invites remain.

## Conditional auto-merge policy

There are **four different routes**. Passing CI does **not** prove that a code works in Muse.

| PR type | Default behavior |
| --- | --- |
| **New, self-reported GitHub invite code** from a complete Issue, not yet in the catalog | **Automatic:** trusted Issue bot makes a Ready PR, then trusted automation checks consent, source, original Issue, exact new JSON record(s), duplicates, current-head CI and mergeability before merging. Listing remains `unverified`. |
| **New code cited from a public Threads, X or Facebook post** | **Automatic as unverified report:** only one new code, a strict original HTTPS post permalink on the selected platform, both contributor checkboxes, no owner-count claims, no duplicate, a bot-only one-file diff and passing exact-head CI. No promise that the URL still works, the post really contains the code or Muse accepts it. |
| **New code submitted through the Telegram bot** | **Automatic as unverified community report:** requires public @username plus explicit consent, matching bot Issue marker/code/author/profile, exactly one new code, no owner-count claims, exact bot-generated JSON, current-head green CI and trusted merge gate. A Telegram profile does not verify ownership, code validity or redemption. |
| **Documentation-only PR authored by @hoangsvit** | **Automatic** after green CI if Ready, only `README.md`, `CONTRIBUTING.md` or Markdown under `docs/` (1–15 changed files, no deletion/rename/mixed code). |
| **Existing-code, ambiguous social-source, feedback, quota, code, UI, workflow or other PRs** | **Manual review:** keep generated community proposals in Draft until reviewed; `@hoangsvit` may authorize merge of the current Ready PR head. |

### Real ePlus Bot reviews (same account as Free Tier Hub)

Muse Invite Hub reuses the **existing GitHub account `@eplus-bot`** and repository Actions secret `EPLUS_BOT_TOKEN`, like Free Tier Hub. New Issue-to-PR proposals are now authored by this real bot identity rather than `github-actions[bot]`; this allows ordinary PR CI to trigger without a maintainer's workflow-run approval. **The bot cannot approve its own PR.** Independently verified new GitHub, strict public-post and Telegram bot invite JSON PRs can be merged by the trusted main-branch gate after original Issue, exact diff, duplicate, current-head CI and GitHub protection checks. Legacy PRs authored by `github-actions[bot]` may still receive real SHA-bound `APPROVED` reviews from `@eplus-bot`. No new GitHub App is needed. Auto-publication never proves the code works in Muse.

**One-time setup:** Open Muse repository **Settings → Secrets and variables → Actions**, and create a secret named `EPLUS_BOT_TOKEN` using the existing eplus-bot account's authorized token. Alternatively give this repository access to an **organization** secret of that name. Secrets owned by Free Tier Hub are not automatically shared with Muse. The account must have permission to review PRs here. Never paste the token into Issues, commits or CI output. No GitHub App Client ID or private key is required.

After configuration, `Issue to Draft PR` uses `@eplus-bot` to create PRs, and `Conditional PR auto-merge` (every 15 minutes plus event triggers) reconciles safe branches, dispatches CI and conditionally merges verified new invites. The bot submits real APPROVED reviews only for eligible PRs created by `github-actions[bot]` (never its own PRs). Missing or invalid credentials fail closed at proposal creation. Existing-code updates, ambiguous or multi-code social sources, owner quotas, feedback and changes to application code/workflows remain manual. A user-submitted valid post URL is a reference only, not independent verification; contributors are responsible for accurate submissions and visitors should verify codes before using them.

A repository OWNER/MEMBER/COLLABORATOR can ask for a real review on a green **Ready** PR by commenting exactly `@eplus-bot review`. This command cannot approve a Draft, blocked or eplus-bot-authored PR, and never by itself authorizes automatic merging of arbitrary code/workflow changes.
For the manual route, after reviewing the source and diff, @hoangsvit may approve the current HEAD in GitHub (where possible) **or** comment `/automerge FULL_40_CHARACTER_HEAD_SHA` on the PR. A new commit invalidates that authorization. The trusted workflow checks current-head validation, GitHub mergeability and the up-to-date `main` branch, then uses squash merge and explicitly dispatches the trusted Pages deployment.

**All four routes can be blocked:** `do-not-merge` label, `/automerge off` by @hoangsvit, Draft status, an unresolved `CHANGES_REQUESTED` review, failed or in-progress CI, merge conflict, or a branch behind `main`. Do not use auto-merge to bypass branch protection. GitHub's built-in repository-level **Allow auto-merge** setting is separate and currently disabled; this workflow implements the conditional policy without a personal access token.

For the GitHub Issue route, the submitting account is recorded as a community reporter, **not independently proven to own the code**. Auto-publication is not live redemption validation. Publish newly submitted strict social post permalinks only with an explicit unverified disclaimer; do not automatically modify existing codes or trust reported social ownership/quotas.

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
| Remaining invites (the only field to enter) | 3 |
| Previous reviewed total (display only, if available) | 30 |
| Calculated used = previous total − remaining | 27 |

The project supports **at most 30 invite slots per code**, not a guaranteed allocation or balance. Valid total values are **1–30**, with remaining and used in **0–30**; used cannot exceed the reported total. A previously reported smaller total (for example 20) remains valid. If only remaining is shown, do not invent the total. The public catalog stores either the complete `reportedCapacity` + `reportedUses` + `usageReportedAt` snapshot, **or** `reportedRemaining` + `usageReportedAt` when only the remaining count is known. The latter displays the remaining number without inventing a total. The Update count form and new Share Code Issue Form expose only **Remaining invites (0–30)** for quota entry; Used and Total are not user inputs. If the same verified GitHub owner previously had a complete, dated reviewed total, the system retains that actual total and calculates used = total − remaining for a review-only proposal. If no reviewed total exists, only the dated remaining count is stored; used remains unknown. Historical Issue comments containing Used/Total remain supported. This does not mean the total was re-confirmed. The trusted workflow proposes an automatic **Draft PR** only when the reporter matches the listed GitHub code owner and the figures are consistent. For Threads, X or Facebook listings, GitHub identity alone does not prove code ownership and quota changes require manual verification. A maintainer must review and merge the proposal before publication.

Amounts are **dated self-reported snapshots**, not live Muse availability. Copying a code is not redeeming it. The published JSON contains a separate `quotaDisplay` projection. Codes **without any count report** display **30/30 · default (unconfirmed)** according to site policy, with **No report** for the date. This is NOT verified availability: the `reported*` values and report date stay absent. `quotaDisplay.used` is `0` by default, or `30 − reported remaining` when only remaining was reported; it is explicitly a policy estimate rather than an owner-reported used count. Codes with accepted dated counts display their reported figures instead, including smaller actual totals. Invalid/incomplete reports remain **Not reported** rather than being silently replaced.

## Automatic Issue-to-PR and publication

**New invite codes:** the [Issue to Draft PR workflow](.github/workflows/issue-to-pr.yml) also creates **Ready PRs** for eligible new GitHub-owned, strict public-post, and bot-authored Telegram codes despite its historical name. It executes trusted `main` code on Issue creation, edits or reopening; validates the two contributor confirmations, source selection and code format; checks the catalog; then writes only independent `data/invite-records/<id>.json` files on a dedicated `auto/issue-<NUMBER>-invite` branch. A single Issue may contain **1–10 distinct new codes**; grouped submissions cannot share quota figures. The bot comments with a PR link or clear correction instructions.

**Automatic GitHub-code path:** a complete, new `GitHub (my own code)` submission gets a **Ready PR**. [Conditional PR auto-merge](.github/workflows/auto-merge.yml) independently re-reads the original open Issue, validates the contributor's actual checklist, compares **every changed JSON file** against deterministic expected records from the current catalog and verifies bot provenance. No duplicate code or code/update/extra-file change qualifies. It then requires successful validation for the exact PR head, an up-to-date `main`, clean mergeability and no blocking review/label/command before squash-merging. Codes publish as **`unverified`**, not validated by Muse.

**Review-only path:** new codes sourced from Threads, X or Facebook require an original public post link and a **Draft PR** for human source/attribution review. Existing-code updates, quota/feedback reports, ownership mismatches, ambiguous/invalid sources and duplicate codes must **not** use new-code auto-merge. Invalid or missing contributor confirmations never authorize publication: keep the original Issue open and guide the contributor to edit it; do not tick the checkboxes for them or require a duplicate Issue.

**Canonical feedback comments:** [Reopen Code Feedback Issue](.github/workflows/reopen-code-feedback.yml) handles human comments on each published code's mapped Issue. It can reopen a closed thread and propose independent review-only Draft PRs for correctly structured usage, worked/not-working reports and GitHub-owner quota changes. Ordinary discussion stays in the existing Issue; posting a comment is not automatic status verification. Older standalone count/feedback Issue Forms remain accepted for compatibility and must match the published source platform.

**Deployment and closure:** only merged `main` is deployed. The trusted [Pages workflow](.github/workflows/pages.yml) verifies the live catalog, code detail and merged commit, then [posts the canonical detail link before closing](scripts/close-accepted-issues.mjs) an accepted new-code/legacy report Issue. For reviewed **GitHub-owner quota updates originating in canonical Issue comments**, the separate [post-deploy count reconciler](scripts/close-published-comment-counts.mjs) verifies exact source/comment identity, PR contents, live dated counts and the absence of newer human feedback; it posts a PR-specific completion comment **before closing** that resolved Issue. If deployment, validation or posting fails, leave the Issue open. New feedback on a closed canonical thread may reopen it; older completed PRs cannot re-close a newer pending discussion. Feedback-only comments remain manual-review discussions and are not automatically closed.

**Setup and recovery:** GitHub Actions needs permission to create PRs (**Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**, when permitted by organization policy). If the bot could not create a PR, rerun **Actions → Issue to Draft PR → Run workflow** for the **original Issue number**. Because PRs made with `GITHUB_TOKEN` may not trigger standard PR workflows, the bot explicitly dispatches validation. A trusted auto-merge also explicitly dispatches Pages; no personal token is needed. Never force-push the user's Issue/branch history.

For the exact decision diagram and different Issue closure rules, see [Contribution flow](docs/CONTRIBUTION_FLOW.md).

## Contribute code or documentation

1. Review [AGENTS.md](AGENTS.md), [open PRs](https://github.com/ePlus-DEV/muse-invite-hub/pulls) and the relevant code before starting.
2. Branch from the latest `main` (or fork the repo and create a branch from its `main`). Use one branch per independent change.
3. Make a focused edit, preserve existing SEO text/canonical unless explicitly authorized, and run the checks below.
4. Open a PR **targeting `main`**, describe what changed, link related Issues, and note any data, SEO or UI impact.
5. Review the CI results, relevant pages and Preview if eligible. A maintainer reviews sensitive changes; authorized Ready PRs and eligible low-risk documentation PRs may merge through the trusted conditional workflow. **Only a merge to `main` publishes production.**

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
node --test scripts/issue-to-pr.test.mjs scripts/close-accepted-issues.test.mjs scripts/close-published-comment-counts.test.mjs
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
| `code` | ), without hyphens |
| `status` | Required `unverified`, `reported-working`, or `reported-not-working` |
| `addedAt` | Required real date in `YYYY-MM-DD` |
| `submittedBy` | Optional public GitHub username, with permission to attribute |
| `note` | Optional plain-text note, max 180 characters |
| `checkedAt` | Optional date of last reviewed community feedback |
| `reportedUses` / `reportedCapacity` / `usageReportedAt` | Optional full snapshot: used ≥ 0, capacity 1–1000, used ≤ capacity, real date `YYYY-MM-DD` |
| `reportedRemaining` / `usageReportedAt` | Alternative remaining-only snapshot: 0–30, real date; cannot mix with full snapshot |
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

Issue Forms do **not** establish Muse validity. Auto-publication is allowed only for new, self-reported GitHub codes when the contributor completed both confirmations, the trusted bot generated exactly matching new JSON records, and CI passes. Never auto-merge arbitrary submitted data, social sources or existing-code updates.

## Community and security

Be respectful. No spam, selling invitations, false reward promises, credential sharing, misleading affiliation claims, or instructions to bypass eligibility and regional restrictions. Only Muse can determine redemption outcomes and current rules.

For security vulnerabilities, follow [SECURITY.md](SECURITY.md), not public Issue comments containing secrets.

[Back to README](README.md)
