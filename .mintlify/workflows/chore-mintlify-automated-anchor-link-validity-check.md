---
name: "chore(mintlify): automated anchor link validity check"
on:
  cron: "3 3 * * *"
---

Go over all mdx pages and check the relative anchor links that start with `#`. For example, the following link points to `#some-anchor`: `[dummy link](#some-anchor)`. Try to fix all anchors that do not point to the correct location.

Do not look at pages that are "whitepapers". Do not look at anything that is not `.mdx`. Ignore all links that start with either `/ecosystem/api/toncenter/v2` or `/ecosystem/api/toncenter/v3`.
