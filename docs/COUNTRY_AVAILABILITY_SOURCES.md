# Muse country availability — source audit

Last checked: **23 November 2026** (Asia/Ho_Chi_Minh).

This file records **publicly announced Muse rollout markets**. It is not a live signup, waitlist, account-region, invite-redemption or token-reward eligibility checker. A country not yet announced is not necessarily blocked.

## Meta-announced rollout markets (6)

| Country | ISO 3166-1 alpha-2 | Date supported by the source | Primary Meta source |
| --- | --- | --- | --- |
| United States | US | 8 September 2026 | [Meta US launch](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) |
| Canada | CA | **Confirmed by** 29 September 2026; precise launch day not asserted here | [Meta business announcement](https://about.fb.com/news/2026/09/introducing-muse-small-business/) |
| Japan | JP | 23 October 2026 | [Meta Japan launch](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/) |
| Singapore | SG | 27 October 2026 | [Meta Singapore launch](https://about.fb.com/news/2026/10/muse-is-now-available-in-singapore-the-worlds-first-personal-ai-agent-built-for-everyone/) |
| Mexico | MX | 5 November 2026 | [Meta Latin America update](https://about.fb.com/ltam/news/2026/09/presentamos-muse-el-primer-agente-de-ia-personal-del-mundo-creado-para-todos/) |
| Australia | AU | 17 November 2026 | [Meta Australia launch](https://about.fb.com/news/2026/11/muse-is-now-available-in-australia/) |

The **latest new official market found in this audit is Australia, 17 November 2026**. See the [official Muse newsroom tag](https://about.fb.com/news/tag/muse/) for later announcements.

## Not confirmed as launched

- **United Kingdom (GB):** a [9 November press report from The Times](https://www.thetimes.com/business/technology/article/mark-zuckerbergs-muse-ai-assistant-uk-launch-c5srqnkb8) said a launch was being prepared. This is a press-reported expectation **not a Meta launch**, and must not be included in the six-market count or styled as supported.
- **Vietnam (VN):** no Meta-announced Muse rollout was identified by this audit. Do not claim that its residents are permanently blocked or that changing regions bypasses requirements.
- Other places without qualifying primary announcements should be labelled **“No verified announcement”**, not “Unavailable”.

## Verification and maintenance rules

1. Check the [official Meta Muse newsroom feed](https://about.fb.com/news/tag/muse/) and regional Meta newsroom posts for a new country-specific launch, not a generic product announcement, rumor, app-store presence or user anecdote.
2. Add a market only with an attributable official launch source; preserve its exact stated rollout or confirmation date. Do not infer a launch date from a later article.
3. Keep the six-source list synchronized across `index.html`, `countries/index.html`, generated detail disclosures from `scripts/site-pages.mjs`, `README.md`, `llms.txt` and `docs/PROJECT_GUIDE.md`. Update count, flags, map behavior and relevant tests if a new country is added.
4. Keep speculative countries visually and textually distinct, and keep an explicit **last checked** date. The date reflects source review, **not** a new launch or live Muse verification.
5. Run `node --test scripts/countries-map.test.mjs scripts/market-layout.test.mjs` and the repository pre-deploy test suite before merging.

Only Muse can determine eligibility for an individual Meta account, registration, invite code or referral tokens. Consult [Muse](https://muse.ai/join) for current terms.
