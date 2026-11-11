## Summary

Describe the user-visible changes and any relevant Issues.

## Checks

- [ ] Static frontend works on desktop and mobile
- [ ] No fabricated code validity, quotas or reward claims
- [ ] Current SEO text and canonical production domain preserved unless explicitly requested
- [ ] CI passes
- [ ] Reviewed the downloadable PR preview artifact or the verified live preview link

## Preview

After the PR passes CI, an automated comment contains the verified preview URL:

https://muse.eplus.dev/pr-preview/pr-<PR NUMBER>/

The preview link is published only after the preview pipeline is active on main and verifies the actual deployed content. Until then, download the offline preview artifact from the Validate workflow.
