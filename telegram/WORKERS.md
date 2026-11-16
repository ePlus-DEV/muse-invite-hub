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

- `/start` — welcome and persistent nine-button menu
- `/codes` — latest published codes
- `/status DPNIHH` — published or pending Issue status and dated **not-live** invite counts
- `/privacy` — public GitHub reporting/privacy rules
- `/cancel` — cancel an inline confirmation
- `/submit DPNIHH` — confirmation prompt, then a **listed** result (no duplicate Issue)
- `/report DPNIHH worked` — confirmation prompt. **Only confirm a genuine attempt**,
  because doing so writes a public comment.

Review and privacy rules are identical to the OCI deployment (see README.md
section 7): new codes become `[Telegram submission]` Issues for human review,
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
