# Telegram Bot — Muse Invite Hub

Use the optional Muse Invite Hub Telegram bot to browse invite codes, share a public code, send feedback and follow a listing. The bot is a **community companion** to [muse.eplus.dev](https://muse.eplus.dev/), not an official Muse or Meta service. A listed code is not guaranteed to work.

> **Bot access:** This repository does not currently contain a verified public bot `@username` or `t.me` invitation URL. We do not publish an unverified bot link. If you already have an authenticated chat with the bot, use it; otherwise you can [contribute through GitHub](https://github.com/ePlus-DEV/muse-invite-hub/issues/new?template=share-code.yml) until the project publishes its verified Telegram handle. Never give a third-party bot your password, session token or OTP.

## Get started

1. In your existing private chat with the verified project bot, send `/start`.
2. Choose **I need a code** to browse or search, or **I have a code to share** to contribute. The bot also accepts slash commands.
3. Choose `/language` for English, Tiếng Việt or 日本語. English is the default. Language preference is private to your bot chat.

The bot only accepts public contributions from a **private Telegram chat**. No GitHub login is needed just to make a bot submission, but the resulting contribution Issue is publicly visible on GitHub.

## Available commands

| Action | Command | What happens |
| --- | --- | --- |
| Browse codes | `/codes` or `/new` | Lists community codes already published on the website |
| Find a code | `/search` or `/get CODE` | Search or view published code details |
| Check a code | `/status CODE` | Shows published status or an existing Issue in review; not live Muse validation |
| Share a new code | `/submit CODE` | Requests explicit confirmation, then creates a public GitHub Issue for review |
| Report your result | `/report CODE worked` or `/report CODE failed` | Requests explicit confirmation, then comments on the existing canonical GitHub Issue |
| Watch one code | `/watch CODE` / `/unwatch CODE` | Follow or unfollow a listing (alerts need the separate notification endpoint configured) |
| New-code alerts | `/subscribe` / `/unsubscribe` | Opt in or out of new-code publication notifications, if enabled |
| Your submissions | `/my` | Displays submissions from the current private bot chat |
| Preferences | `/settings`, `/language`, `/privacy`, `/delete_data` | Change options or clear private bot preferences/history |
| Cancel a prompt | `/cancel` | Stop a pending confirmation |

Replace `CODE` with **exactly six letters A–Z or digits 0–9**. The syntax check cannot establish that Muse will redeem the code.

## What happens after /submit?

1. Enter a new, publicly shareable invite code and confirm that the code may be shared.
2. Confirm that your **public Telegram @username and profile URL** may be published in a GitHub Issue. If your account has no public username, the bot does not create an Issue.
3. The bot checks the published catalog and existing Issues to reduce duplicate submissions; a valid new submission uses the **same `[Invite] CODE` Issue Form fields** as the website, with source `Telegram`.
4. GitHub Actions prepares an **unverified Draft PR**. A maintainer must check the source, attribution and sharing permission before merging or publishing. The GitHub Issue author's name is the service bot, **not** proof that the bot owns the code.
5. After a reviewed merge and successful website deployment, the canonical Issue gets a public link to the accepted code detail page. A submitted Issue or green CI result alone is not acceptance.

If the original Issue is deleted, any still-open, bot-generated data PR linked to it is invalidated and closed without publication. If a code was previously reported, the bot links to the existing Issue instead of silently creating another.

## Feedback, privacy and anti-spam

- To report that a code **worked or failed for you**, use `/report CODE worked` or `/report CODE failed`. A comment is added to the original public GitHub Issue; it does **not** automatically change the code's published status.
- Telegram messages may include your private chat ID, but **numeric Telegram IDs are never intentionally published** in Issues, PRs or the site. The invite code, your consented public @username/profile and public Issue comments **are visible to everyone**.
- Private preferences and opt-in notifications are kept in bot runtime storage. `/delete_data` removes saved preferences/history, but cannot remove already-public GitHub Issues or comments or reset anti-spam enforcement.
- Public GitHub writes have rate limits and duplicate checks. If the bot reports a limit, do not create new accounts to evade it; try again later. Read-only browsing does not constitute a submission.
- A Telegram profile link or @username **does not prove code ownership**, remaining invitations or successful Muse redemption. Never provide a password, authentication code, session token or private invite link.

## Maintainers and deployment

The Telegram bot runs separately from GitHub Pages and can use a Cloudflare Worker or an OCI-hosted Node.js webhook. Updating the website alone does not deploy the bot. Only one webhook runtime should be active.

- [Cloudflare Worker deployment and verification](../telegram/WORKERS.md)
- [OCI ARM64 / Docker deployment](../telegram/README.md)
- [Publication notifications and privacy](TELEGRAM_NOTIFICATIONS.md)
- [Contribution and review flow](CONTRIBUTION_FLOW.md)
