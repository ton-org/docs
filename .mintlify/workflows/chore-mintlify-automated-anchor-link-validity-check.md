---
name: "chore(mintlify): automated anchor link validity check"
on:
  cron: "3 3 * * *"
---

Go over almost all `.mdx` pages and check the relative anchor links that start with `#`. For example, the following link points to `#some-anchor`: `[dummy link](#some-anchor)`. Try to fix all anchors that do not point to the correct location.

Do not look at pages that are called whitepapers: skip `languages/fift/whitepaper`, `foundations/whitepapers/overview.mdx`, `foundations/whitepapers/tvm.mdx`, `foundations/whitepapers/tblkch.mdx`, `foundations/whitepapers/ton.mdx`, `foundations/whitepapers/catchain.mdx`.

Do not look at anything that is not `.mdx`.

Ignore all links that start with either `/ecosystem/api/toncenter/v2`, `/ecosystem/api/toncenter/v3`, or `/ecosystem/api/toncenter/smc-index`.
