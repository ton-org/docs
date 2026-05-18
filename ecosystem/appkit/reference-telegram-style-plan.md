# AppKit reference: Telegram Bot API-style research and implementation plan

Research date: 2026-04-29

Status: planning only. This file records the research and implementation plan before rewriting `ecosystem/appkit/reference.mdx`.

## Objective

Rewrite `ecosystem/appkit/reference.mdx` so it reads like the [Telegram Bot API reference](https://core.telegram.org/bots/api): dense, predictable, method-and-type reference documentation that developers can scan quickly.

The result must still follow TON Docs and Mintlify constraints:

- Keep MDX frontmatter with `title`, `sidebarTitle`, and `icon`.
- Do not add an in-body H1.
- Use stable headings and root-absolute links.
- Keep AppKit isolated under the AppKit tab.
- Prefer generated or generated-style content derived from public package exports.

## Telegram Bot API format research

Fetched and analyzed `https://core.telegram.org/bots/api`.

Observed structure:

- Single long canonical reference page.
- `h1` page title, `h3` major sections, `h4` methods/types/changelog entries, rare deeper subheads.
- Parsed counts from the fetched page: `h1`: 1, `h3`: 13, `h4`: 473, `h5`: 9, `h6`: 4.
- Table patterns: `Field | Type | Description` appears 263 times; `Parameter | Type | Required | Description` appears 161 times.

Top-level Telegram sections:

1. Recent changes
1. Authorizing your bot
1. Making requests
1. Using a Local Bot API Server
1. Getting updates
1. Available types
1. Available methods
1. Updating messages
1. Stickers
1. Inline mode
1. Payments
1. Telegram Passport
1. Games

Method format:

- Heading is the method name, for example `sendMessage`.
- Short prose starts with `Use this method to...`.
- Return value is stated in prose: `On success, ... is returned.`
- Parameters use a four-column table: `Parameter`, `Type`, `Required`, `Description`.
- Required values are `Yes` or `Optional`.
- Examples are sparse; reference tables carry the page.

Object/type format:

- Heading is the type name, for example `Message`.
- Short prose starts with `This object represents...`.
- Fields use a three-column table: `Field`, `Type`, `Description`.
- Optional fields start with italic `Optional.` in the description.
- Types are compact and linkable: `String`, `Boolean`, `Array of MessageEntity`, `Integer or String`.

Concept format:

- Shared rules are documented once before method/type lists.
- Authentication, request shape, file upload, webhook behavior, response shape, and update handling are explained before the reference inventory.
- Internal links cross-reference methods, types, and concepts heavily.
- Anchors are stable and predictable: kebab-case for major sections, lowercase compact slugs for methods/types.

Tone:

- Terse and reference-first.
- Consistent phrases: `This object represents...`, `Use this method to...`, `On success... is returned.`, `Optional.`
- Avoids marketing copy and long tutorials inside reference content.

## Current AppKit reference state

Target file:

- `ecosystem/appkit/reference.mdx`

Current state:

- Compact generated-style API surface map.
- Lists package entrypoints, export groups, hooks, components, and type families.
- Does not yet provide Telegram-style per-method, per-hook, parameter, return, and field tables.

Navigation state:

- AppKit already has a separate Mintlify tab in `docs.json`.
- Reference page is `ecosystem/appkit/reference`.
- AppKit leaf pages now have icon frontmatter.

## AppKit API source research

Use package public exports as source of truth.

Public entrypoints:

- `@ton/appkit`
- `@ton/appkit/queries`
- `@ton/appkit/swap/omniston`
- `@ton/appkit/swap/dedust`
- `@ton/appkit/staking/tonstakers`
- `@ton/appkit-react`
- `@ton/appkit-react/styles.css`

Source roots:

- `C:\Users\User\windev\ton-connect__kit\packages\appkit`
- `C:\Users\User\windev\ton-connect__kit\packages\appkit-react`
- `C:\Users\User\windev\ton-connect__kit\packages\walletkit` for re-exported WalletKit/DeFi types and providers.

Export scan summary:

- `packages/appkit/src`: 134 TypeScript files, 451 direct export declarations.
- `packages/appkit-react/src`: 89 TypeScript/TSX files, 170 direct export declarations.
- Largest groups: AppKit queries, actions, React feature hooks, and shared types.

Accuracy rules:

- Only document public exports reachable from package entrypoints.
- Do not document tests, stories, private utilities, or non-exported source paths.
- Do not document source comments that mention package subpaths not present in `package.json` exports.
- Validate current reference names against actual barrels; some names can be stale.
- React re-exports all core AppKit exports, so avoid duplicating core APIs as React-specific APIs.

## Format decision

Use a single reference page first, matching Telegram's monolithic reference style.

Why:

- The user asked for the Telegram Bot API format.
- AppKit currently has one `Reference` sidebar leaf.
- One page keeps APIs searchable with browser find.
- Splitting can come later if the page becomes too large.

Mintlify adaptation:

- Telegram `h3` sections become MDX `##` sections.
- Telegram `h4` entries become MDX `###` entries.
- Use tables for reference content:
  - Actions/hooks/components: `Parameter | Type | Required | Description`.
  - Objects/types/configs/props: `Field | Type | Description`.
- Keep code examples short and secondary.
- Link to focused guides for tutorials instead of duplicating long walkthroughs.

## Proposed `reference.mdx` structure

1. `## Recent changes`
   - AppKit package versions and sync metadata.
   - Short bullets for public API changes if known.

1. `## Packages and imports`
   - Public entrypoints and import examples.
   - Note that `@ton/appkit-react` re-exports `@ton/appkit`.

1. `## Creating an AppKit instance`
   - Telegram-style entries for `AppKit`, `AppKitConfig`, `Network`, connectors, providers, and API client config.

1. `## Making requests with AppKit actions`
   - Shared action conventions: core actions take `appKit` first; parameters are typed objects; most return promises.

1. `## Available action methods`
   - Groups: balances, connectors, wallets, network, Toncoin transactions, jettons, NFTs, signing, swaps, staking, providers.
   - Each entry: heading, one-sentence description, parameter table, return sentence, optional short example.

1. `## Available React hooks`
   - Explain query and mutation hook conventions.
   - Group by the same domains.
   - Each entry: heading, one-sentence description, parameter table, return sentence.

1. `## Available React components`
   - Include `AppKitProvider`, `I18nProvider`, base UI components, asset components, send components, and transaction progress components.
   - Props use `Field | Type | Description` tables.

1. `## Query helpers`
   - Document `@ton/appkit/queries` naming conventions and grouped inventories.
   - Full per-helper tables can be phase 2 unless generation is accurate.

1. `## Available types`
   - Telegram-style object/type entries for key public config, parameter, return, asset, transaction, swap, and staking types.

1. `## DeFi providers`
   - Document Omniston, DeDust, and Tonstakers subpath exports.

1. `## Related guides`
   - Short links to Event Ticket Checkout, initialization, Toncoin, jettons, NFTs, and staking.

## Entry templates

Method/action entry:

```md
### transferTon

Use this function to send Toncoin from the selected wallet. On success, a wallet transaction response is returned.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `appKit` | `AppKit` | Yes | AppKit instance configured with a selected wallet. |
| `parameters.recipientAddress` | `string` | Yes | Recipient wallet address. |
| `parameters.amount` | `string` | Yes | Human-readable Toncoin amount, for example `0.1`. |
| `parameters.comment` | `string` | Optional | Text comment added to the transfer payload. |

Returns: `Promise<TransferTonReturnType>`.
```

Type/object entry:

```md
### AppKitConfig

This object configures networks, connectors, providers, and default AppKit behavior.

| Field | Type | Description |
| --- | --- | --- |
| `networks` | `Record<string, NetworkConfig>` | Network configuration keyed by chain id. |
| `connectors` | `Connector[]` | Optional. Wallet connectors available to the app. |
```

Hook entry:

```md
### useTransferTon

Use this hook to request a Toncoin transfer from React. On success, the wallet transaction response is returned through mutation state.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `parameters` | `UseTransferTonParameters` | Optional | Mutation configuration passed to the underlying query library. |

Returns: `UseTransferTonReturnType`.
```

Component entry:

```md
### AppKitProvider

This component provides an `AppKit` instance to React hooks and components.

| Field | Type | Description |
| --- | --- | --- |
| `appKit` | `AppKit` | AppKit instance. |
| `children` | `ReactNode` | React subtree that can use AppKit hooks. |
```

## Generation strategy

Preferred implementation: generated source plus curated overlay.

1. Read package public entrypoints from `package.json` exports.
1. Resolve source barrels for each public entrypoint.
1. Use the TypeScript compiler API to collect exported symbols.
1. Classify exports as class, function/action, React hook, React component, type/interface/enum, query helper, or utility.
1. Extract symbol name, source path, JSDoc, call signatures, parameter names/types, return type, interface fields, optionality, and field comments.
1. Apply curated overlay JSON for missing descriptions and examples.
1. Render deterministic MDX using Telegram-style templates.
1. Add a generated note explaining source and sync process.

Fallback if compiler extraction is too slow:

- Use package barrels and existing action/type files to build a high-value manual generated-style page.
- Prioritize accuracy for public actions, hooks, components, and key types.
- Keep query helpers as grouped inventories until full extraction is available.

## Proposed helper script

Add later, after this plan:

- `scripts/generate-appkit-reference.mjs`

Inputs:

- AppKit package source root.
- AppKit React package source root.
- Optional `scripts/appkit-reference-overrides.json` with curated descriptions.

Output:

- `ecosystem/appkit/reference.mdx`

## Phases

Phase 1:

- Monolithic Telegram-style reference page.
- Public package entrypoints.
- Core setup types.
- All public action methods with parameter/return tables.
- All public React hooks with parameter/return tables.
- Main React components with prop tables.
- Important type families and DeFi subpath exports.

Phase 2:

- Full type field extraction.
- Per-entry query helper sections.
- Stable anchor map for every type and method.
- Source metadata comments or generated metadata.

Phase 3, only if needed:

- Split into `ecosystem/appkit/reference/actions.mdx`, `react.mdx`, `types.mdx`, and `queries.mdx`.

## Validation risks

- Markdown tables with long generic types can trigger formatter warnings.
- Generic unions containing pipes must be wrapped in code spans or escaped.
- Full `check:links` may fail from unrelated repo-wide broken links.
- Local spell check may be blocked by Node version.
- A very large single-page MDX can slow Mintlify preview.
- Re-exported WalletKit types require separate source lookup.

## Acceptance criteria

- `ecosystem/appkit/reference.mdx` follows Telegram-style method/type sections.
- Every documented API is public from an AppKit package entrypoint.
- High-value actions and hooks have parameter and return tables.
- Core config and component props have field tables.
- Long tutorial samples are replaced by concise reference entries.
- Focused guides remain linked for examples.
- `npm.cmd run check:navigation` passes.
- `npm.cmd run check:fmt:some` passes for the reference page and this plan file.
- AppKit sidebar isolation remains unchanged.

## Next implementation checklist

1. Build export inventory from public package entrypoints.
1. Generate or draft the Telegram-style MDX outline.
1. Add curated descriptions for top actions, hooks, components, and config types.
1. Rewrite `ecosystem/appkit/reference.mdx` using the templates above.
1. Run formatting and navigation validation.
1. Review diff for stale/private APIs.
1. Keep the existing Cloudflare preview tunnel available if the local server remains running.
