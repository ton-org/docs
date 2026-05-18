# TON Docs (Next.js + Fumadocs)

A Fumadocs-based replacement for the previous Mintlify build of `docs.ton.org`.
The design system mirrors [Acton's docs](https://ton-blockchain.github.io/acton/) but uses TON's brand color **#0098EA**.

## Develop

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```sh
npm run build
```

## Lint

```sh
npm run lint
npm run lint:links
npm run lint:navigation
```

## Layout

- `src/app/` — Next.js app router routes (docs, llms.txt, og, sitemap, robots).
- `src/components/` — Acton design components + Mintlify-compatibility shims (`mintlify/`).
- `src/lib/` — Source loader, MDX components, OG generator, layout config.
- `content/docs/` — Migrated MDX content (codemod target).
- `grammars/` — Shiki TextMate grammars for Tolk / FunC / TLB / Fift / TASM.
- `scripts/` — Validation scripts (links, navigation).
