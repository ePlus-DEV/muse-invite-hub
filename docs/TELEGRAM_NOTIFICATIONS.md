# Telegram publication notifications

See also [Telegram bot setup](../telegram/README.md) and [Cloudflare Workers option](../telegram/WORKERS.md).

## Opt-in publishing notifications

Notification code is **disabled until configured**. It uses the private `private-profiles.json` created by the interactive Reply Keyboard bot. This file must remain on the persistent `/data` mount with mode 0600; it is never published by Pages or checked into Git. Telegram contributors are stored only by private chat-to-Issue association; no Telegram identity goes into a public Issue.

After the interactive-menu and notification changes have both merged and the chosen bot runtime is deployed:
1. Generate a distinct 32-byte random signing secret (`openssl rand -hex 32`).
2. Set **the same value privately** as `TELEGRAM_NOTIFY_SECRET` on the bot runtime and as an Actions repository secret. Never place it in `wrangler.toml`, Git files or GitHub variables.
3. Set GitHub Actions repository variable `TELEGRAM_NOTIFY_URL` to the existing bot's HTTPS `https://<your-bot-domain>/telegram/notify` endpoint. This must be a deployed runtime, not the public Pages website.
4. Run `/subscribe` in a private Telegram chat to opt into new-code notifications; `/watch CODE` subscribes to publication of a specific pending/listed code. `/unsubscribe`, `/unwatch CODE`, and `/delete_data` remove preferences.
5. On a later verified Pages deployment, the trusted workflow posts an HMAC-SHA256 signed SHA-and-cursor event. The bot reads the **published production catalog**, compares it with the prior snapshot and delivers only genuinely new code listings. The first event initializes the snapshot without blasting historical codes. It sends one message per subscribed chat/batch and records per-chat/per-code sent markers.

## Per-user notification settings

Open Settings → Notification settings, or send `/notifications`. The master switch pauses all publication and quota alerts without deleting preferences. New-code alerts remain opt-in (`/subscribe` and `/unsubscribe`); personal contribution and watched-code publication alerts keep their historical defaults, and watched-code quota alerts default off. Quota alerts use dated reported remaining counts, not the default quota or live Muse availability.

Choose Immediate, 10 minutes (default), or 1 hour. Immediate sends a new message on each eligible publication; the other options send the first message immediately and edit it for subsequent eligible publications within that fixed window. They are not scheduled delayed digests. Telegram may not push an additional notification for an edit. No new cron or paid service is required. Old baselines migrate silently without notifying historical quota changes. Recipient-specific permanent errors (blocked bot, deactivated user or missing chat) are skipped without interrupting other users; transient errors remain retryable. Preferences are not removed when delivery fails.

The notification feature does **not** auto-deploy infrastructure or run an hourly poll. An unset `TELEGRAM_NOTIFY_URL` skips publishing notifications. If a configured bot endpoint fails, the Pages job reports that failure, even though GitHub Pages may already be deployed. Use the Actions job logs and bot health endpoint to investigate.

Telegram and KV/network transports cannot promise exactly-once delivery through all crashes; delivery markers limit retries, but a crash after Telegram accepts a message and before the marker persists can cause a duplicate. No report of a code working or owner identity is inferred from a successful notification.
