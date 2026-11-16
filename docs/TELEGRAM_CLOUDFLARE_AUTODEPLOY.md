# Automatic Cloudflare Workers deployment — Muse Invite Hub Telegram Bot

The public `muse.eplus.dev` website is deployed by **GitHub Pages**.
The Telegram Bot is a **separate Cloudflare Worker**. A successful website
deployment does NOT deploy the bot. PR #194 and PR #195 have merged into main,
but `/start` remains the old menu until the Worker runtime is redeployed.

## Recommended: Cloudflare Workers Builds (no GitHub API token)

Use Cloudflare's native GitHub integration. It authenticates the deploy from
Cloudflare rather than requiring a Cloudflare token in GitHub Actions.

1. In **Cloudflare → Workers & Pages**, select the **existing** Worker
   `muse-invite-hub-telegram`. If the active Telegram bot is attached to
   a different Worker name, stop and identify it rather than deploying a
   second bot under the wrong name.
2. In **Settings → Builds** choose **Connect Git repository**, authorize
   `ePlus-DEV/muse-invite-hub`, and set the **production branch** to `main`.
3. In the build configuration use:
   - **Root directory:** `telegram`
   - **Build command:** `node prepare-deploy.mjs`
   - **Deploy command:** `npx wrangler deploy --config wrangler.deploy.toml`
   - **Preview builds:** disabled initially; never point preview instances
     to the production private `BOT_STATE` binding.
4. In the existing Worker's **Settings → Bindings**, find the currently bound
   KV namespace with binding `BOT_STATE`. In **Build variables** set
   `MUSE_BOT_STATE_KV_ID` to **that exact existing namespace ID** (32 hex
   characters). This is a resource identifier, **not** a Telegram token.
   Never create a new KV namespace merely to deploy a code update: the
   existing one stores subscriptions, update deduplication and notification
   delivery markers.
5. The **Worker runtime secrets** must already include
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
   `GITHUB_ISSUES_TOKEN` and, if notifications are enabled,
   `TELEGRAM_NOTIFY_SECRET`. These remain in Cloudflare **Variables &
   Secrets**; do not place them in build variables or repository files.
6. Save the Git integration and deploy the latest `main` from Cloudflare.
   Once configured, every eligible new push/merge to `main` automatically
   triggers a Workers Build. GitHub Pages remains independent.

Cloudflare dashboard labels for the build settings can vary slightly.
Make sure the Worker `name` still matches `muse-invite-hub-telegram` in
`wrangler.toml`. Do not accidentally connect the GitHub Pages website
as a second Cloudflare Pages project.

### Why not run the existing Wrangler config directly?

The committed `telegram/wrangler.toml` deliberately contains the placeholder
`REPLACE_WITH_KV_NAMESPACE_ID`. This must be resolved for the **existing**
KV binding before deployment.

`prepare-deploy.mjs` validates the Worker identity, binding and existing
namespace ID, then generates an **untracked** `wrangler.deploy.toml`.
The generated file pins `BUILD_SHA` to the actual checked-out Git commit.
It rejects invalid IDs, unknown branches masquerading as commit SHAs, and
attempts to change an already configured KV namespace. It does not contain
Telegram credentials or create cloud resources.

## How to verify after the next deploy

In the Cloudflare Worker dashboard check its newest production deployment
is green and corresponds to the latest `main` commit.

On the **actual Worker webhook hostname** run:

```bash
curl -fsS https://<actual-worker-domain>/healthz
curl -fsS https://<actual-worker-domain>/version
```

Expected: `{"status":"ok"}` and an object containing the 40-character
Git revision: `{"revision":"<sha-of-deployed-main>"}`.

Open the bot's private conversation, send `/start`, and verify the
persistent **nine-button Reply Keyboard**. Test `🎟 Nhận mã` and
`🔎 Tìm mã` (read-only) before trying any public contribution.
If the registered webhook URL has not changed, do not rotate tokens or
re-register the webhook. The separate BotFather slash-command picker can be
updated later using `register-webhook.mjs` in a private environment.

A 200 response from `/healthz` alone **does not** prove the newest code
was deployed: old versions also have this endpoint. The `/version`
revision check is the reliable deployment proof.

## If it still does not deploy

- **No Cloudflare build after merge:** the Worker has no connected GitHub
  repository, production branch isn't `main`, or build watch paths exclude
  `telegram/**`.
- **Missing namespace ID:** set `MUSE_BOT_STATE_KV_ID` in **Build variables**.
- **Missing runtime secrets:** configure those on the Worker, not in GitHub.
- **Worker name mismatch:** connect the existing Worker with matching name,
  don't deploy a duplicate.
- **Cloudflare deploy succeeded but Telegram menu remains old:** verify the
  actual bot's webhook targets this Worker, compare `/version` to `main`
  and send a new `/start`. The reply keyboard is rendered by the bot.
- **Notifications not arriving:** separate configuration is required for
  `TELEGRAM_NOTIFY_URL` and signed notification events; a deploy alone
  doesn't subscribe users automatically.

Official Cloudflare documentation:
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/
