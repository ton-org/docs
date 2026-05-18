# docs.ton.org → Fumadocs cutover runbook

This document walks through the staging and cutover steps for replatforming
**docs.ton.org** from Mintlify to the Next.js / Fumadocs app under `next/`.

The new app is fully self-contained: every existing URL, redirect, OG image,
sitemap entry and `llms.txt` artifact is generated locally — no external SaaS.

---

## 1. Local sanity check

```bash
cd next
npm ci
npm run generated-source
npm run build      # ~90s, prerenders 1376 routes
npm run start      # http://localhost:3000
```

Verify the following endpoints respond as expected:

| URL                                                                | Expected |
|--------------------------------------------------------------------|----------|
| `/`                                                                | 200 — landing page                              |
| `/start-here`                                                      | 200 — first doc                                 |
| `/tolk/overview`                                                   | 200 — Tolk overview                             |
| `/ecosystem/api/toncenter/v3/accounts/get-account-states`          | 200 — OpenAPI-rendered                          |
| `/participate/explorers`                                           | 308 → `/ecosystem/explorers/overview`           |
| `/v3/concepts/dive-into-ton/introduction`                          | 308 → `/start-here`                             |
| `/this-page-does-not-exist`                                        | 404                                             |
| `/llms.txt`                                                        | 200 plain text                                  |
| `/llms-full.txt`                                                   | 200 plain text                                  |
| `/llms.mdx/start-here.md`                                          | 200 Markdown                                    |
| `/og/docs/start-here/image.png`                                    | 200 PNG (≈60 KB)                                |
| `/sitemap.xml`                                                     | 200 XML                                         |
| `/robots.txt`                                                      | 200 text                                        |
| `/api/search?query=tolk`                                           | 200 Orama JSON                                  |

## 2. Lint suite

```bash
npm run fmt:check
npm run lint
npm run lint:navigation
npm run lint:links:internal      # tolerates pre-existing broken-link baseline
LINKS_BASELINE=0 npm run lint:links:internal   # block-on-regression for content sweeps
npm run lint:links:external      # optional, network-bound
```

## 3. Staging deploy (Vercel)

1. Create a Vercel project pointed at this repo, with **Root Directory** =
   `next/` and the framework preset set to **Next.js**.
2. Add the project secrets to GitHub: `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
   `VERCEL_PROJECT_ID`. The workflow at `.github/workflows/next-build.yml`
   then publishes a preview URL on every PR.
3. Attach the `docs-next.ton.org` domain to the Vercel project as a custom
   domain. This is the staging surface — point your own DNS at Vercel's
   `cname.vercel-dns.com`.
4. Smoke-test the staging URL with the matrix from §1.

## 4. Production cutover

1. **Content freeze.** Stop merging to Mintlify; coordinate authors to land
   pending PRs on the new app's branch instead.
2. **Final delta sync.** From the freeze commit on Mintlify, run
   `node next/scripts/migrate-content.mjs` once more to pick up any last
   changes and regenerate `redirects.mjs`.
3. **OG smoke.** Spot-check 5–10 `/og/docs/.../image.png` URLs in staging —
   the gradient + page title should render with the TON blue palette.
4. **DNS cutover.** Switch the `docs.ton.org` A/CNAME records from Mintlify
   to Vercel. TTL ~5 min is fine; Vercel's edge caches absorb the wave.
5. **Disable Mintlify webhook** so any stragglers don't republish over the
   live site.
6. **Monitor 404s.** Tail Vercel's analytics → "Top pages with 4xx" for the
   first 1–2 weeks and triage anything that wasn't covered by
   `redirects.mjs`. Add new entries to `next/redirects.mjs` and redeploy.

## 5. Rollback plan

If anything serious surfaces in the first 24 hours:

1. Flip DNS back to Mintlify. The Mintlify deployment is left untouched
   during the cutover.
2. File a bug in this repo with the offending URL, response, and steps.
3. Address on a follow-up PR; restart from §3 with a new staging build.

## 6. Out-of-scope follow-ups

- Tighten `LINKS_BASELINE=0` after a content sweep fixes the 313 inherited
  broken links (mostly `/languages/tolk/*` → `/tolk/*` renames).
- Re-host the heavy interactive snippets
  (`CatchainVisualizer`, `TvmInstructionTable`) as proper TypeScript modules
  rather than the current JSX-pinned copies in `src/components/legacy/`.
- Replace Mintlify analytics + AI search with self-hosted equivalents
  (Plausible/Posthog + a richer Orama bundle).
