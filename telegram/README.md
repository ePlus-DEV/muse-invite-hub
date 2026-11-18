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

## Contributor attribution and Share Code form compatibility

A new code submission requires a public Telegram `@username` from the Telegram update, not text claimed by a chat user. The sender must explicitly agree in Telegram to publish their `@username` and public profile URL, and confirm their right to share a public, non-secret code. If no username is configured, the bot does not submit an Issue.

The resulting public **`[Invite] CODE`** Issue uses the exact standard Share Code headings and section order, without any extra Telegram-only section. `Code source` is Telegram; the consented public profile URL appears under **Public confirmation or context**, with `@username` in **Notes**. An internal marker distinguishes the bot-created Issue from a GitHub-owner submission. Numeric user/chat IDs remain private. A profile URL is **not** proof of code ownership or a public source post.

The same trusted Issue-to-PR pipeline automatically creates a **review-only Draft PR** from a valid bot-authored Telegram Issue after checking the internal marker, consented username, source, duplicates and permissions. It never attributes the bot's GitHub identity as code owner or auto-publishes a Telegram code; the maintainer must verify validity and sharing permission before approval.

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

**New code:** `/submit CODE` → explicitly confirm public username and sharing/privacy → check catalog and open/closed Issues → create one standard **`[Invite] CODE`** Issue if unlisted → GitHub Actions creates a review-only **Draft PR** automatically. The bot's GitHub identity is never the code owner. A maintainer reviews identity, permission and source before merge; no automatic publication.

**Existing code feedback:** /report CODE worked|failed → explicit public comment confirmation → append a report to the original canonical GitHub Issue. The existing workflow deliberately **ignores bot-authored comments**, so manual triage is required. No duplicate per-code Issues and no direct catalog status changes.

**Owner count:** `/count` redirects to the website's verified GitHub owner flow. Telegram username or numeric ID never proves code ownership. Only the explicitly consented public `@username`/profile is included in new-code Issues; numeric Telegram IDs remain private.

**Anti-spam:** both OCI and Cloudflare Worker apply shared limits: up to **8 public GitHub writes per hour**, **12 per 24 hours**, **3 new-code submissions per chat per 24 hours**, and **one feedback report per code/chat per 24 hours**. A best-effort shared cap of **20 new-code submissions/hour and 80/day** protects the public Issue queue across chats. Retried Telegram updates do not consume an extra slot. OCI stores private write history persistently in `telegram/state/write-limits.json` (or the configured DATA_DIR), separate from public GitHub records; `/delete_data` cannot reset abuse limits. Cloudflare Workers KV stores private counters with a 24-hour TTL; KV is eventually consistent, so limits are **not a fully atomic distributed lock**. If traffic exceeds these bounds, consider a Durable Object or centralized atomic store. Bot update IDs persist to disk across reboots; reports include deduplication markers. Confirmation buttons are removed after the result is delivered, reducing accidental repeat submissions; GitHub markers remain the final safeguard. Temporary processing failures return HTTP 503 for Telegram retries. A minimal per-chat rate limit prevents unbounded public Issue creation.

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

## Interactive private-chat menu

After deploying this version and reopening the bot, `/start` shows a persistent 3×3 Reply Keyboard: Find codes, New codes, Search, Contribute, My codes, Report, Notifications, Watchlist and Settings. Each published code uses Telegram's native `copy_text` button, details link, watch and genuine-report actions. Prompts for a code last 10 minutes. The bot keeps a **private** profile per Telegram chat (opt-in alerts, watched codes and Issue links created by this chat); these do **not** prove ownership. The `/delete_data` command clears this private profile, but cannot erase public Issues/comments already submitted after consent.

The menu and opt-in preferences are implemented in both the OCI and Workers runtimes. Actual background publication delivery is a separate feature; toggling subscriptions **does not** send alerts until that delivery service is configured. **Do not** describe listed codes as verified live or Telegram users as code owners.

## Telegram bot languages

The Telegram bot supports **Tiếng Việt, English and 日本語** consistently
across the persistent 3×3 keyboard, invite cards, copy/report/watch buttons,
search and submission confirmations, status/privacy/help, preferences, and
opt-in publication notifications. **English is the default** for every
new chat, regardless of Telegram's `from.language_code`.

Open **⚙️ Cài đặt / Settings / 設定 → 🌐 Ngôn ngữ / Language / 言語**
or send `/language`; choose your language. Alternatively send
`/language vi`, `/language en`, or `/language ja`.
The choice is stored privately alongside the existing bot profile and
**remains in effect** until changed, regardless of Telegram's interface language.
Previously auto-detected languages without a manual choice switch to English
on the next interaction.
Changing the language immediately redraws the persistent keyboard, and
existing callbacks continue to work regardless of language. A previous
English or Vietnamese keyboard label is still accepted after switching.
`/delete_data` deletes the saved preference with other private settings;
the next `/start` uses English again.

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
selector (translated into English, Vietnamese and Japanese):

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

- **Refresh behavior:** the persistent keyboard has no redundant Refresh row.
  Lists and individual code details retain inline Refresh. Inline refresh
  re-fetches data and edits the **same Telegram card**; unchanged data shows
  a short "Already up to date" toast rather than another identical message.
  It preserves the current search/sort/page and cannot write to GitHub.
  The legacy `/refresh` command and old keyboard labels remain supported.
- **Paged Browse/Search:** one compact Telegram message displays up to five
  published codes with buttons to open each code. **Previous / Next** pages
  retain the user's last search and sort in the private chat profile, and
  **Back to codes / Main menu** provide explicit navigation. Inline Refresh
  preserves the current listing/page. Opening a code displays the available
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
working after a locale switch. After a new bot feature is deployed, users
can send `/start` or tap **Main menu** to receive the latest version's
keyboard; no global Refresh button, account migration or new bot is needed.
Bot deploys remain independent of GitHub Pages.
