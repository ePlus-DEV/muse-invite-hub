# Cloudflare Workers — Telegram Bot deployment (alternative to OCI)

`worker.mjs` runs the same bot as `server.mjs` — same commands, messages and
review rules — on Cloudflare Workers instead of an OCI VM. It reuses
`bot.mjs` and `github.mjs` unchanged. Webhook secret comparison is
constant-time (SHA-256 digest comparison), and update-ID deduplication plus
the per-chat write rate limit live in a KV namespace, so they stay durable
across Worker instances. No polling, cron or paid plan is required; the
Workers free tier is more than enough for webhook traffic.

Merging alone does **not** deploy the bot unless Cloudflare Workers Builds is
connected to this repository. GitHub Pages and Cloudflare Workers deploy
independently.

## Automatic Cloudflare deployment from GitHub

The site is published by GitHub Pages, but that workflow does **not** deploy
the separate Telegram Worker. Cloudflare Workers Builds can deploy the Worker
on every push to `main` after one-time GitHub integration. Follow the
[Cloudflare Workers Builds guide](../docs/TELEGRAM_CLOUDFLARE_AUTODEPLOY.md)
to configure the existing Worker, preserve its private `BOT_STATE` KV namespace
and verify the actual live source revision. No Cloudflare API token needs to
be stored in GitHub with this method.

## Cloudflare Preview build failure on PR #198 (diagnosed)

The test build log confirms `node prepare-deploy.mjs` **completed successfully**.
The failing command was **`npx wrangler preview`**, automatically selected
because PR #198 is on a branch other than the configured production branch.
This is a **Preview** deployment, not the production Worker deployment. A
Preview requires a `previews` configuration and its own separate `BOT_STATE`
KV namespace. Never bind a Preview to the production bot's KV, Telegram token
or GitHub Issues write token just to make a PR check green.

**Chosen rollout: production builds only for the Telegram bot.**

1. In Cloudflare Workers & Pages, select the actual
   `muse-invite-hub-telegram` **Worker**, not a Pages project.
2. Under **Settings → Builds → Branch control**, keep **Production branch =
   `main`** and turn **Enable Preview Builds = off**. This prevents automatic
   preview deploys on PR branches and removes the need to provision a preview KV.
3. In **Settings → Builds → Build watch paths**, set **Include = `telegram/*`**,
   Exclude empty. This rule is evaluated against paths relative to the Git
   repository root and matches nested Telegram files as well.
4. In build settings, keep Root = `telegram`, Build =
   `node prepare-deploy.mjs`, and **production Deploy =
   `npx wrangler deploy --config wrangler.deploy.toml`**. The PR log's
   `npx wrangler preview` is the **separate preview command**, not evidence
   that your production deploy command is misconfigured.
5. Keep `MUSE_BOT_STATE_KV_ID` set to the existing production `BOT_STATE`
   namespace ID. Merge a reviewed, CI-green `telegram/` change to `main`,
   then check Cloudflare **Production** Builds and `/version` on the actual
   webhook Worker. A PR-only build cannot prove production deployment.

A non-production branch showing a skipped/no Cloudflare Preview check after
disabling previews is **expected**. Production auto-deploy is verified only
after a merge to `main`. Keep Github Pages deployment independent.

If Preview deployments are wanted in a later phase, create an isolated
Preview-only KV namespace and Preview-safe configuration **first**, then
enable preview builds and configure the Preview command explicitly. Do not
copy real Telegram webhook credentials or runtime writes into Preview.

Official references:
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/

## Smoke test: build only when `telegram/` changes (2026-11-16)

This documentation-only commit intentionally changes **only**
`telegram/WORKERS.md` as a low-risk test of the existing Cloudflare
Workers Builds Git integration. The Telegram runtime and webhook are
unchanged. Once this commit is merged to the production `main` branch,
a correctly configured path filter should initiate **one Cloudflare
Workers Build** for the bot.

In **Workers & Pages → existing Telegram Worker → Settings → Builds**:

- **Git repository:** `ePlus-DEV/muse-invite-hub`
- **Production branch:** `main`
- **Root directory:** `telegram`
- **Build watch paths → Include paths:** `telegram/*` (**repository-relative**;
  **not** `/telegram`, `telegram/` or `*`)
- **Build watch paths → Exclude paths:** empty
- **Build command:** `node prepare-deploy.mjs`
- **Deploy command:** `npx wrangler deploy --config wrangler.deploy.toml`
- **Build variable:** `MUSE_BOT_STATE_KV_ID` = the existing private-state
  KV namespace ID; do **not** create a replacement namespace
- **Preview builds:** disabled for this production-only test

The include filter matches nested paths, for example
`telegram/WORKERS.md` and `telegram/worker.mjs`; unrelated changes to
`assets/`, `data/` or `docs/` should **not** trigger this Worker build.
Setting the root directory alone does not enable filtering.

### Verify the build after merge

1. Open **Cloudflare Worker → Deployments / Builds**, verify the deployment
   corresponds to this merged `main` commit and succeeded.
2. Fetch `https://<active-telegram-worker-host>/version` and compare its
   `revision` with the exact merged `main` SHA. The SHA changes on merge.
3. In the existing Telegram private chat, send `/start`; confirm the
   persistent nine-button menu is shown. Do not click a public GitHub
   submission unless you actually intend to contribute a code.
4. Verify a later commit touching **only non-`telegram/`** files does not
   start a Cloudflare Worker build (GitHub Pages can deploy separately).

If no Cloudflare build starts, this smoke test **does not prove a code
failure**: check that Git integration and path filters are configured on
the **actual deployed Worker**, not a Pages project or another Worker.
No Cloudflare account configuration is stored in this repository.

## Manual Wrangler deployment (alternative)

### 1. Prerequisites

- A Cloudflare account and Wrangler: `npx wrangler login` (or an API token
  with Workers Scripts + Workers KV edit permissions).
- A Telegram bot token from @BotFather (`/newbot`).
- A webhook secret: `openssl rand -hex 32`.
- A **fine-grained** GitHub token scoped ONLY to `ePlus-DEV/muse-invite-hub`
  with **Issues: Read and write** (same credential as the OCI deployment).

### 2. Create the KV namespace (first installation only)

```bash
cd telegram
npx wrangler kv namespace create BOT_STATE
```

Use the **existing** namespace ID as `MUSE_BOT_STATE_KV_ID` and run `node prepare-deploy.mjs`, then deploy with `npx wrangler deploy --config wrangler.deploy.toml`. Never commit the generated configuration.

### 3. Set the three secrets (never commit them)

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put GITHUB_ISSUES_TOKEN
```

### 4. Deploy and verify

```bash
node prepare-deploy.mjs
npx wrangler deploy --config wrangler.deploy.toml
curl --fail https://muse-invite-hub-telegram.<your-subdomain>.workers.dev/healthz
```

Expected health response: `{"status":"ok"}`.

### 5. Register the Telegram webhook

Reuse `register-webhook.mjs` with the Workers hostname as `BOT_DOMAIN`:

```bash
TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… \
  BOT_DOMAIN=muse-invite-hub-telegram.<your-subdomain>.workers.dev \
  node register-webhook.mjs
```

This calls `setWebhook` for `https://<BOT_DOMAIN>/telegram/webhook` with the
secret-token header, `max_connections=1` and `allowed_updates` for
message/callback_query, then registers the private-chat command menu via `setMyCommands`. A custom domain (e.g. `bot.muse.eplus.dev`) can be
attached later as a Workers custom domain; re-run this step after changing it.

### 6. Test in a private chat

- `/start` — welcome and current persistent menu (new buttons appear after the new Worker deploy and the next /start)
- `/codes` — latest published codes
- `/status DPNIHH` — published or pending Issue status and dated **not-live** invite counts
- `/privacy` — public GitHub reporting/privacy rules
- `/cancel` — cancel an inline confirmation
- `/submit DPNIHH` — confirmation prompt, then a **listed** result (no duplicate Issue)
- `/report DPNIHH worked` — confirmation prompt. **Only confirm a genuine attempt**,
  because doing so writes a public comment.

Public-write anti-spam uses private `BOT_STATE` KV: 8 writes/hour, 12 writes/day, max 3 new-code Issues/chat/day, max 1 feedback per code/chat/day, plus a best-effort 20-new-Issues/hour and 80/day across chats. Telegram update retry IDs are idempotent. KV's eventual consistency means distributed concurrency can still bypass the cap; strict limits require an atomic coordinator. Review and privacy rules are identical to the OCI deployment (see README.md
section 7): new codes become standard `[Invite] CODE` Issues with an internal
Telegram marker, which automatically prepare review-only Draft PRs;
feedback lands on the canonical Issue, and Telegram identity never proves
code ownership or authorizes count updates.

## Updating

After a reviewed change to `telegram/` merges to main:

```bash
git pull --ff-only
cd telegram
node prepare-deploy.mjs
npx wrangler deploy --config wrangler.deploy.toml
```

KV state (processed update IDs, rate limits) is unaffected by redeploys.

## Signed publication notifications

After the interactive menu is merged, set `TELEGRAM_NOTIFY_SECRET` with `npx wrangler secret put TELEGRAM_NOTIFY_SECRET`. Reuse the **same private value** in the GitHub Actions repository secret and configure the repository Actions variable `TELEGRAM_NOTIFY_URL` with the HTTPS Worker `/telegram/notify` URL. This is not the public GitHub Pages host. Do not put secrets in wrangler.toml or URLs. No new KV namespace is needed: existing `BOT_STATE` holds private `profile:` preferences, notification baseline and per-recipient delivery markers. No cron is required. The first verified deployment initializes the catalog baseline without messaging subscribers about old codes; subsequent deployments send only newly published codes. Workers KV is eventually consistent, so failed/retried requests can rarely repeat a message. Senders can opt out through the bot.

## Telegram bot languages

The Telegram bot supports **Tiếng Việt, English and 日本語** consistently
across the persistent 3×3 keyboard, invite cards, copy/report/watch buttons,
search and submission confirmations, status/privacy/help, preferences, and
opt-in publication notifications. **English is the default** for every
new chat, independent of Telegram's `from.language_code` (including
Vietnamese and Japanese Telegram interfaces).

Open **⚙️ Cài đặt / Settings / 設定 → 🌐 Ngôn ngữ / Language / 言語**
or send `/language`; choose your language. Alternatively send
`/language vi`, `/language en`, or `/language ja`.
The choice is stored privately alongside the existing bot profile and
**remains in effect** until changed, regardless of Telegram's interface language.
Older profiles with automatically detected language (without a manual choice)
also switch to English on their next interaction.
Changing the language immediately redraws the persistent keyboard, and
existing callbacks continue to work regardless of language. A previous
English or Vietnamese keyboard label is still accepted after switching.
`/delete_data` deletes the saved preference with other private settings;
the next `/start` uses the default English again.

After deploying a new version, re-run
`telegram/register-webhook.mjs` **in your existing private runtime** to
update the Telegram slash-command picker descriptions for English,
Vietnamese and Japanese. It does **not** require a new bot, a new KV
namespace, token rotation, or a different webhook. Slash-command names
such as `/submit` and callback payload values remain language-neutral;
GitHub Issues and moderation flows are not translated or weakened.

## Choose your purpose on first start

On the first `/start`, the bot no longer presents every contribution and
consumer action at once. It asks what the user needs, with an **intent**
selector and a separate Refresh button (translated into English, Vietnamese
and Japanese):

- **🙋 I need a code:** A 3×3 reader menu for Browse codes, New codes, Search,
  Need a code, opt-in Alerts, Watchlist, Report, Settings and Switch role.
  The **Need a code** action lets the user browse immediately, start searching
  or explicitly enable alerts when **new** codes are published. It does not
  reserve a code, guarantee redemption, create a GitHub Issue or silently
  enroll anyone into subscriptions.
- **🤝 I have a code to share:** A 3×3 contributor menu for Submit a public
  code, My submissions from this Telegram chat, Check review/publication status,
  New codes, Browse, Report, Alerts, Settings and Switch role. Public GitHub
  submissions still require an explicit confirmation and human review.

- **🔄 Refresh** (also `/refresh`): a dedicated fourth row below the original
  nine role-menu actions, available on onboarding and both roles. Fetches the
  latest published community codes again, newest first. Refresh is read-only:
  it never opens GitHub Issues, submits feedback, redeems codes, opts in to
  alerts or changes a role/language. It dismisses an unfinished text-entry
  prompt to avoid accidental submissions.
- **Paged Browse/Search:** one compact Telegram message displays up to five
  published codes with buttons to open each code. **Previous / Next** pages
  retain the user's last search and sort in the private chat profile, and
  **Back to codes / Main menu** provide explicit navigation. Refresh starts
  at the newest published page. Opening a code displays the available
  catalog status, platform, contributor (when supplied), added date and
  last dated remaining-count report, with Copy, Watch, Report, Refresh
  and navigation buttons. The public code detail link opens the website.
  None of these data is live Muse redemption verification.

This is **not a permission or ownership role**. Users can change their
preferred menu with **🔄 Switch role**, `/role`, or the corresponding button
under Settings at any time; existing private opt-in subscriptions, watchlists,
and submission history survive changes. `/start` shows the last chosen menu;
a newly created profile gets the choice prompt. Legacy commands like
`/submit CODE` and `/get CODE` still work for everyone without forcing
an onboarding choice.

The preference is stored only in the existing private chat profile in the
Worker's `BOT_STATE` KV (or OCI private profile file), together with
language. `/delete_data` clears this preference; the welcome choice is
shown again. Inline callbacks are language-independent to keep older buttons
working after a locale switch.


## Keeping Telegram menu buttons current

Telegram stores persistent Reply Keyboards on the client; a new Worker deploy
does not overwrite an already displayed keyboard. The bot now uses **lazy
menu synchronization**: the current keyboard fingerprint is derived from its
role-specific translated buttons and saved privately as `menuVersion` in
`BOT_STATE` KV, only after a successful Telegram `sendMessage` reply-keyboard
request. When a user next interacts through an old menu, or has a saved older
fingerprint, the bot sends the new keyboard once **before** handling the action.
The action is not dropped, and no message is broadcast to dormant chats.

For a one-off refresh, open **Settings → 🔄 Refresh menu** or use `/menu`.
`/start`, role changes and language changes already send a current keyboard
without an extra synchronization message. The bot recognizes older menu labels
so users can still navigate. `/delete_data` erases the stored fingerprint and
does not recreate a profile merely to save a menu version.

**Operational check:** the Telegram webhook runtime must first deploy the
merged `main` code. Verify its `/version` endpoint and the configured
Webhook's actual host; publishing GitHub Pages alone is insufficient. No
Telegram tokens or GitHub credentials need to change. A bot with old runtime
cannot send new buttons. The menu fingerprint intentionally does not use the
Git commit SHA, so catalog-only releases do not resend keyboards.

## Telegram navigation and notification batching (2026-11-18)

- A **Reply Keyboard** button (Get codes, New codes, Search, Settings, etc.)
  creates a **fresh inline panel at the bottom of the chat**, best-effort
  removing the previous bot-owned panel. The same applies to typed query
  results and slash commands; this prevents editing content far above new
  notifications and makes each tap visibly actionable.
- An **Inline Keyboard** callback (pagination, code details, Refresh, settings
  submenus) edits the message carrying that callback, not the global saved
  panel. Unchanged Refresh produces a callback toast, not a duplicate card.
- Opted-in new-code notifications from separate Pages deploys within a fixed
  **10-minute window** coalesce by editing a recent bot notification.
  The first event sends a normal push, later events update the same message
  (Telegram may **not** push another alert for an edited notification).
  After 10 minutes, or if editing fails because the message was deleted,
  the next event sends a fresh message. Every published code retains its own
  deduplication marker, and failed deliveries can be retried.
- Digest state is private and bounded: Worker KV uses
  `notify:digest:<chat-id>` with a one-hour TTL; OCI stores the last
  digest in `notification-state.json`. No invite records, chat IDs or
  subscriber preferences are published in GitHub.
- **After merge:** deploy the actual Telegram Worker or OCI service. A
  successful GitHub Pages deployment does not guarantee the Telegram
  webhook runtime was updated. Verify the live runtime before testing.

