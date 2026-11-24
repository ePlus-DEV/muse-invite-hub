# Muse country availability — source audit

Last checked: **24 November 2026** (Asia/Ho_Chi_Minh).

This file records **publicly announced Muse rollout markets**. It is not a live signup, waitlist, account-region, invite-redemption or token-reward eligibility checker. A country not yet announced is not necessarily blocked.

## Supported rollout markets (7)

| Country | ISO 3166-1 alpha-2 | Date supported by the source | Rollout source |
| --- | --- | --- | --- |
| United States | US | 8 September 2026 | [Meta US launch](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) |
| Canada | CA | **Confirmed by** 29 September 2026; precise launch day not asserted here | [Meta business announcement](https://about.fb.com/news/2026/09/introducing-muse-small-business/) |
| Japan | JP | 23 October 2026 | [Meta Japan launch](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/) |
| Singapore | SG | 27 October 2026 | [Meta Singapore launch](https://about.fb.com/news/2026/10/muse-is-now-available-in-singapore-the-worlds-first-personal-ai-agent-built-for-everyone/) |
| Mexico | MX | 5 November 2026 | [Meta Latin America update](https://about.fb.com/ltam/news/2026/09/presentamos-muse-el-primer-agente-de-ia-personal-del-mundo-creado-para-todos/) |
| Australia | AU | 17 November 2026 | [Meta Australia launch](https://about.fb.com/news/2026/11/muse-is-now-available-in-australia/) |
| United Kingdom | GB | 24 November 2026 | [The Sun — Meta executive interview](https://www.thesun.co.uk/tech/41117674/meta-muse-uk-ai-agent-app/) |

## UK launch evidence — 24 November 2026

- [The Guardian](https://www.theguardian.com/technology/2026/nov/24/meta-launches-muse-uk-ai-agent-do-christmas-shopping) and [The Times](https://www.thetimes.com/uk/technology-uk/article/meta-muse-ai-agent-pk020505v) independently report that Muse launched in the UK and quote Meta statements. [The Sun](https://www.thesun.co.uk/tech/41117674/meta-muse-uk-ai-agent-app/) interviews Meta VP of Engineering for AI Products and explicitly reports UK availability from 24 November.
- [Muse on Threads](https://www.threads.com/@muse/post/DgHSJbukY4c) is the direct @muse post URL supplied by the maintainer. Its body could not be independently retrieved; the supported status rests on the independently accessible launch evidence above, not an assumed quote from this post.
- The UK is the seventh supported rollout market and uses the same blue map status as the other six. A dedicated Newsroom article was not located at review time. Individual eligibility remains unverified.

## No verified announcement

- **Vietnam (VN):** no Meta-announced Muse rollout was identified by this audit. Do not claim that its residents are permanently blocked or that changing regions bypasses requirements.
- Other places without qualifying evidence should be labelled **“No verified announcement”**, not “Unavailable”.

## Verification and maintenance rules

1. Check the [official Meta Muse newsroom feed](https://about.fb.com/news/tag/muse/) and regional Meta newsroom posts for a new country-specific launch, not a generic product announcement, rumor, app-store presence or user anecdote.
2. Include a supported market when an official Meta/Muse announcement or multiple credible contemporaneous reports with attributable Meta statements establish actual rollout. Record the precise evidence type and date. Never treat future plans as a launch.
3. Keep the seven supported markets and their source links synchronized across `index.html`, `countries/index.html`, generated detail disclosures from `scripts/site-pages.mjs`, `README.md`, `llms.txt` and `docs/PROJECT_GUIDE.md`. Update count, flags, map behavior and relevant tests if a new country is added.
4. Keep confirmed, press-reported and speculative countries visually and textually distinct, and keep an explicit **last checked** date. The date reflects source review, **not** a new launch or live Muse verification.
5. Run `node --test scripts/countries-map.test.mjs scripts/market-layout.test.mjs` and the repository pre-deploy test suite before merging.

Only Muse can determine eligibility for an individual Meta account, registration, invite code or referral tokens. Consult [Muse](https://muse.ai/join) for current terms.
