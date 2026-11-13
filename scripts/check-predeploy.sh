#!/usr/bin/env bash
# Shared, side-effect-free production pre-deploy checks.
# Run on EVERY pull request before merge and again in the trusted Pages job.
set -euo pipefail

node scripts/validate.mjs
node scripts/audit-links.mjs
node --test scripts/validate.test.mjs scripts/preview.test.mjs scripts/preview-fallback.test.mjs scripts/audit-links.test.mjs
node --check scripts/site-pages.mjs
node --test scripts/site-pages.test.mjs scripts/verify-production.test.mjs scripts/seo-aeo.test.mjs scripts/page-skeleton.test.mjs scripts/directory-features.test.mjs scripts/copied-codes.test.mjs scripts/site-ui.test.mjs scripts/site-navigation.test.mjs scripts/market-layout.test.mjs scripts/countries-map.test.mjs scripts/code-issue-map.test.mjs scripts/feedback-comment-to-pr.test.mjs
node --check scripts/verify-production.mjs
node --check assets/app.js
node --check assets/detail.js
node --check assets/site-ui.js
node --check assets/countries.js
node --check scripts/build-pages.mjs
node --check scripts/code-issue-map.mjs
node --check scripts/reopen-code-feedback.mjs
node --check scripts/feedback-comment-to-pr.mjs
node --check scripts/post-preview-status.mjs
node --check scripts/close-accepted-issues.mjs
node --test scripts/close-accepted-issues.test.mjs
