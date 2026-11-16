# Oracle Cloud Always Free ARM64 — Telegram Bot deployment

> **Alternative hosting:** the same bot also runs on Cloudflare Workers
> (`worker.mjs`, no VM required) — see [WORKERS.md](WORKERS.md). The review
> and privacy rules in section 7 below apply to both runtimes.

Invite codes in `/submit` and `/report` are exactly 6 letters (A–Z) or digits (0–9), without hyphens; lowercase input is normalized. A valid format does not establish that Muse accepts the code.

Use this **same repository**: GitHub Pages continues to serve muse.eplus.dev and its catalog; an OCI Ampere A1 VM can run the Telegram Bot/API. Cloudflare Workers is an alternative runtime (see WORKERS.md); you need only one runtime and one webhook. Merging code does **not** create any cloud resources or configure a real Telegram bot.

## 1. Provision OCI A1 + DNS

Choose an **Always Free eligible** VM.Standard.A1.Flex (Ubuntu ARM64) instance in the tenancy home region, with a public IPv4 and SSH key. The **current** Oracle documentation allows **2 A1 OCPUs and 12 GB RAM in total** for Always Free accounts (1,500 OCPU-hours and 9,000 GB-hours per month). A sensible starting VM for this lightweight bot is 1 OCPU and 2–4 GB RAM. Check your other A1 instances, boot volume, networking quotas and billing status; Oracle may reclaim idle free VMs.

Create a DNS A record, e.g. bot.muse.eplus.dev → OCI_PUBLIC_IP. That example is NOT automatically created by this PR.

In OCI VCN security lists/NSGs allow **TCP 80 + TCP 443** inbound from the internet; restrict **SSH 22 to your own public IP**. Never expose port 3000 or Docker daemon ports. Verify Ubuntu firewall rules too.

Sources:
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://core.telegram.org/bots/api#setwebhook
- https://caddyserver.com/docs/quick-starts/https

## 2. Build ARM64 image on GitHub, not on the VM

After this PR is reviewed and merged to main: **Actions → Build Telegram OCI ARM64 image → Run workflow (main)**. The manual workflow runs Node tests and Docker Buildx linux/arm64, then pushes:

- ghcr.io/eplus-dev/muse-invite-hub-telegram:latest
- ghcr.io/eplus-dev/muse-invite-hub-telegram:sha-<main-commit-sha>

Publishing uses the ephemeral built-in GitHub Actions GITHUB_TOKEN and requires no custom publishing key. GHCR packages may be **private** when first created. Set the package to **Public** to pull without credentials; otherwise perform docker login on the VM with a separate read:packages credential. Do not hardcode credentials.

**No automatic VM deployment, hourly schedule or production image build on every merge.** Only a manually triggered workflow on trusted main can push the image.

## 3. Install Docker on Ubuntu

SSH to your VM, then:

~~~bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
docker --version
docker compose version
~~~

If Compose v2 is unavailable in the Ubuntu apt mirror, follow the official Docker Engine + Compose plugin Ubuntu documentation: https://docs.docker.com/engine/install/ubuntu/

## 4. Clone this repository and set secrets on the VM

~~~bash
git clone https://github.com/ePlus-DEV/muse-invite-hub.git ~/muse-invite-hub
cd ~/muse-invite-hub/telegram
cp .env.example .env
chmod 600 .env
mkdir -p state
sudo chown 1000:1000 state
openssl rand -hex 32
nano .env
~~~

Set these values in the **private** .env:

| Variable | Meaning |
| --- | --- |
| BOT_DOMAIN | Public HTTPS hostname pointing to your OCI VM (e.g. bot.muse.eplus.dev) |
| BOT_IMAGE | Image name or pinned SHA tag from GHCR |
| TELEGRAM_BOT_TOKEN | Token created by Telegram @BotFather /newbot |
| TELEGRAM_WEBHOOK_SECRET | New secret, e.g. from openssl rand -hex 32 |
| GITHUB_ISSUES_TOKEN | **Fine-grained** GitHub token, scoped to ePlus-DEV/muse-invite-hub, with Issues: Read and write |

A GitHub credential on the private bot server is required if Telegram users are to create GitHub Issues/comments without logging into GitHub. The short-lived GITHUB_TOKEN available to Actions is not accessible to the OCI VM. A narrowly scoped GitHub App is a future alternative.

Never commit, screenshot or share the real .env, tokens, OTPs or private account details.

## 5. Start Compose and verify HTTPS

Wait until DNS resolves to your public IP and OCI ingress 80/443 is reachable.

~~~bash
cd ~/muse-invite-hub/telegram
sudo docker compose --env-file .env config --quiet
sudo docker compose --env-file .env pull
sudo docker compose --env-file .env up -d
sudo docker compose --env-file .env ps
sudo docker compose --env-file .env logs --tail=60 telegram-bot caddy
curl --fail-with-body https://bot.muse.eplus.dev/healthz
~~~

Expected health response: {"status":"ok"}. Replace the sample hostname with your real BOT_DOMAIN. Do not share unredacted output of docker compose config without --quiet, because it may print secrets.

Caddy handles HTTPS certificates and routes only /healthz and /telegram/webhook to the private bot container. Port 3000 is not publicly published. Bot update deduplication state is stored in telegram/state; TLS data is stored in persistent named volumes.

## 6. Register Telegram webhook after HTTPS works

No token appears in the command line: run the registration script **inside the existing private container**, where environment variables are already loaded:

~~~bash
cd ~/muse-invite-hub/telegram
sudo docker compose --env-file .env exec -T telegram-bot node telegram/register-webhook.mjs
~~~

This calls setWebhook with the HTTPS hostname and secret token header, max_connections=1 and allowed_updates for message/callback_query, then registers the private-chat command menu through setMyCommands. No polling, cron or hourly GitHub Action is required.

Test your bot via private chat:

- /start — help
- /codes — latest published codes
- /status DPNIHH — published status, dated self-reported remaining count or pending Issue (**not live Muse verification**)
- /privacy — what is shared publicly in GitHub and what remains private
- /cancel — cancel a confirmation (or press Cancel under the prompt)
- /submit DPNIHH — confirmation prompt, then a **listed** result (no duplicate Issue)
- /report DPNIHH worked — confirmation prompt. **Only confirm if reporting a genuine attempt**, because doing so writes a public comment.
- /count DPNIHH — explains that GitHub-verified ownership is required for counts.

## 7. Review and privacy rules

**New code:** /submit CODE → explicit public-sharing confirmation → check catalog and open/closed Issues → create ONE [Telegram submission] Issue only if unlisted. This bot-authored Issue is **not** processed as a verified contributor's [Invite] submission. A maintainer reviews attribution, source and privacy, then prepares a data Draft PR. No auto-merge or catalog changes.

**Existing code feedback:** /report CODE worked|failed → explicit public comment confirmation → append a report to the original canonical GitHub Issue. The existing workflow deliberately **ignores bot-authored comments**, so manual triage is required. No duplicate per-code Issues and no direct catalog status changes.

**Owner count:** /count redirects to the website's verified GitHub owner flow. Telegram username or numeric ID never proves code ownership. The bot does not store Telegram identity in public GitHub Issues.

Bot update IDs persist to disk across reboots; reports include deduplication markers. Confirmation buttons are removed after the result is delivered, reducing accidental repeat submissions; GitHub markers remain the final safeguard. Temporary processing failures return HTTP 503 for Telegram retries. A minimal per-chat rate limit prevents unbounded public Issue creation.

## 8. Updating and recovery

After a new reviewed main commit and manual GitHub Actions image build:

~~~bash
cd ~/muse-invite-hub
git pull --ff-only
cd telegram
sudo docker compose --env-file .env pull
sudo docker compose --env-file .env up -d
sudo docker compose --env-file .env ps
~~~

Containers use restart: unless-stopped to recover after VM reboot. Use docker compose logs --tail=100 telegram-bot or docker compose logs --tail=100 caddy for troubleshooting. Running docker compose down does not remove stored state/certificates, but **down -v** would remove Caddy volumes.

## Not included yet

This first deployment adds a functional private-chat Bot. It does **not** implement a Telegram Mini App, Telegram-GitHub account linking, automatic review PRs for bot comments, or automatic owner verification. Those should follow separately once the VM, webhook, review workflow and secrets have been tested in production.

## Optional opt-in notification delivery (requires interactive-menu PR)

Notification code is **disabled until configured**. It uses the private `private-profiles.json` created by the interactive Reply Keyboard bot. This file must remain on the persistent `/data` mount with mode 0600; it is never published by Pages or checked into Git. Telegram contributors are stored only by private chat-to-Issue association; no Telegram identity goes into a public Issue.

After the interactive-menu and notification changes have both merged and the chosen bot runtime is deployed:
1. Generate a distinct 32-byte random signing secret (`openssl rand -hex 32`).
2. Set **the same value privately** as `TELEGRAM_NOTIFY_SECRET` on the bot runtime and as an Actions repository secret. Never place it in `wrangler.toml`, Git files or GitHub variables.
3. Set GitHub Actions repository variable `TELEGRAM_NOTIFY_URL` to the existing bot's HTTPS `https://<your-bot-domain>/telegram/notify` endpoint. This must be a deployed runtime, not the public Pages website.
4. Run `/subscribe` in a private Telegram chat to opt into new-code notifications; `/watch CODE` subscribes to publication of a specific pending/listed code. `/unsubscribe`, `/unwatch CODE`, and `/delete_data` remove preferences.
5. On a later verified Pages deployment, the trusted workflow posts an HMAC-SHA256 signed SHA-and-cursor event. The bot reads the **published production catalog**, compares it with the prior snapshot and delivers only genuinely new code listings. The first event initializes the snapshot without blasting historical codes. It sends one message per subscribed chat/batch and records per-chat/per-code sent markers.

The notification feature does **not** auto-deploy infrastructure or run an hourly poll. An unset `TELEGRAM_NOTIFY_URL` skips publishing notifications. If a configured bot endpoint fails, the Pages job reports that failure, even though GitHub Pages may already be deployed. Use the Actions job logs and bot health endpoint to investigate.

Telegram and KV/network transports cannot promise exactly-once delivery through all crashes; delivery markers limit retries, but a crash after Telegram accepts a message and before the marker persists can cause a duplicate. No report of a code working or owner identity is inferred from a successful notification.
