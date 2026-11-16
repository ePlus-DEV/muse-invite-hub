# Cloudflare Workers — Telegram Bot deployment (alternative to OCI)

`worker.mjs` runs the same bot as `server.mjs` — same commands, messages and
review rules — on Cloudflare Workers instead of an OCI VM. It reuses
`bot.mjs` and `github.mjs` unchanged. Webhook secret comparison is
constant-time (SHA-256 digest comparison), and update-ID deduplication plus
the per-chat write rate limit live in a KV namespace, so they stay durable
across Worker instances. No polling, cron or paid plan is required; the
Workers free tier is more than enough for webhook traffic.

Merging this code does **not** deploy anything. Deployment is a manual,
maintainer-run sequence:

## 1. Prerequisites

- A Cloudflare account and Wrangler: `npx wrangler login` (or an API token
  with Workers Scripts + Workers KV edit permissions).
- A Telegram bot token from @BotFather (`/newbot`).
- A webhook secret: `openssl rand -hex 32`.
- A **fine-grained** GitHub token scoped ONLY to `ePlus-DEV/muse-invite-hub`
  with **Issues: Read and write** (same credential as the OCI deployment).

## 2. Create the KV namespace

```bash
cd telegram
npx wrangler kv namespace create BOT_STATE
```

Copy the returned namespace id into `wrangler.toml` (`REPLACE_WITH_KV_NAMESPACE_ID`).

## 3. Set the three secrets (never commit them)

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put GITHUB_ISSUES_TOKEN
```

## 4. Deploy and verify

```bash
npx wrangler deploy
curl --fail https://muse-invite-hub-telegram.<your-subdomain>.workers.dev/healthz
```

Expected health response: `{"status":"ok"}`.

## 5. Register the Telegram webhook

Reuse `register-webhook.mjs` with the Workers hostname as `BOT_DOMAIN`:

```bash
TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… \
  BOT_DOMAIN=muse-invite-hub-telegram.<your-subdomain>.workers.dev \
  node register-webhook.mjs
```

This calls `setWebhook` for `https://<BOT_DOMAIN>/telegram/webhook` with the
secret-token header, `max_connections=1` and `allowed_updates` for
message/callback_query. A custom domain (e.g. `bot.muse.eplus.dev`) can be
attached later as a Workers custom domain; re-run this step after changing it.

## 6. Test in a private chat

- `/start` — help
- `/codes` — latest published codes
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
npx wrangler deploy
```

KV state (processed update IDs, rate limits) is unaffected by redeploys.
