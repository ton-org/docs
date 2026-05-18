# AppKit docs: greenfield Telegram-style plan

Research date: 2026-04-29

Status: planning only. This plan intentionally disregards the existing AppKit docs structure. It treats AppKit as if Telegram were launching a new developer documentation area for it from scratch.

## Premise

AppKit documentation should feel like a Telegram/Core property, not like a framework documentation template.

The primary model is:

- `telegram.org`: calm product explanation, FAQ, apps, releases, and lightweight navigation.
- `core.telegram.org`: developer hub pages, concise conceptual pages, long canonical references, protocol/schema pages, and link-dense related docs.

Legacy TON Docs pages, current sidebar groups, and Mintlify defaults are delivery constraints only. They must not define the information architecture.

## Target reader journeys

Design the docs around five journeys.

1. A developer wants to add wallet connection and one transaction to a web app.
1. A developer wants to understand what AppKit is responsible for and what it delegates to wallets, RPC providers, TonConnect, and TON contracts.
1. A developer wants to build product flows: payments, jettons, NFTs, swaps, staking, signing, and wallet data.
1. A developer wants exact API details: imports, methods, hooks, parameters, return values, types, errors, and version changes.
1. A developer wants to diagnose production issues: connection failures, rejected transactions, wrong network, malformed payloads, stale balances, and API provider errors.

## Site identity

If this were a standalone Telegram-style site, it would live conceptually at:

- `core.telegram.org/appkit`

The top navigation would be:

```text
AppKit | Start | Concepts | Build | Reference | Examples | Releases
```

This navigation is intentionally broad and shallow. Telegram docs do not make readers traverse deep nested trees before they know what they need.

## Information architecture

Greenfield page tree:

```text
/appkit
  index
  faq
  releases

/appkit/start
  index
  installation
  quick-start
  configuration
  wallet-connection
  first-transaction
  production

/appkit/concepts
  index
  what-appkit-does
  appkit-instance
  wallets-and-connectors
  sessions
  networks
  providers
  transactions
  assets
  react-integration
  errors

/appkit/build
  index
  connect-wallets
  send-toncoin
  send-jettons
  read-balances
  work-with-nfts
  sign-data
  swap-tokens
  stake-toncoin
  track-transactions
  handle-network-changes
  build-checkout

/appkit/examples
  index
  minimal-react-app
  event-ticket-checkout
  jetton-checkout
  nft-ticket
  swap-widget
  staking-widget

/appkit/reference
  index
  packages
  appkit
  actions
  react
  queries
  components
  types
  defi-providers
  errors

/appkit/schema
  appkit-config
  transaction-request
  sign-data-request
  wallet
  connector
  network
  jetton
  nft
  swap
  staking
```

This tree is not an instruction to preserve or migrate current files. It is the target mental model.

## Home page: `/appkit`

The home page should behave like a Telegram developer hub.

It should not start with cards or marketing copy. It should start with a definition.

Example opening:

```text
AppKit is a TypeScript toolkit for adding TON wallet connection, payments, assets, DeFi flows, and React UI primitives to web applications.
```

Then show a compact map:

| If you want to...              | Read        |
| ------------------------------ | ----------- |
| Add AppKit to a new app        | Quick start |
| Understand the moving parts    | Concepts    |
| Build wallet and payment flows | Build       |
| Look up functions and types    | Reference   |
| Copy a complete flow           | Examples    |
| Upgrade safely                 | Releases    |

Home page sections:

- `## What AppKit is`
- `## What AppKit includes`
- `## Start building`
- `## Packages`
- `## Documentation map`
- `## Current status`
- `## Related TON docs`

The page should be short. It is a router, not a tutorial.

## Start section

The Start section is the equivalent of Telegram's onboarding pages: direct, minimal, and designed for first success.

Pages:

### `/appkit/start`

A hub page with the smallest possible path:

1. Install packages.
1. Create an AppKit instance.
1. Add React provider.
1. Connect a wallet.
1. Send a test transaction.
1. Move to production.

### `/appkit/start/installation`

Covers package installation and supported environments.

Telegram-style rules:

- Start with exact install commands.
- State supported package entrypoints.
- State browser/framework assumptions.
- Do not explain every feature.

### `/appkit/start/quick-start`

A single-page working integration.

Template:

- `## Before you begin`
- `## Install AppKit`
- `## Create the AppKit instance`
- `## Add React providers`
- `## Connect a wallet`
- `## Send a test transaction`
- `## Next steps`

The quick start should be copyable and short. It should not become the Event Ticket tutorial.

### `/appkit/start/configuration`

Canonical setup page for `AppKitConfig`.

Use tables for config fields. Keep conceptual explanations short and link to Concepts.

### `/appkit/start/wallet-connection`

First wallet connection page.

It explains TonConnect, selected wallet state, connect/disconnect, reconnect, and common failures.

### `/appkit/start/first-transaction`

Small Toncoin transaction flow. No checkout story. Just one transaction.

### `/appkit/start/production`

A production checklist in Telegram style.

Sections:

- Manifest and app identity
- Mainnet/testnet selection
- RPC provider keys
- Error handling
- User rejection
- Transaction confirmation
- Logging and observability
- Security notes

## Concepts section

Concept pages are canonical explanations. They should be written like `core.telegram.org/mtproto`: stable mental models, not recipes.

Pages:

### `/appkit/concepts/what-appkit-does`

Defines responsibilities and boundaries.

AppKit handles:

- Wallet connection orchestration.
- AppKit instance state.
- TonConnect connector integration.
- Transaction and signing requests.
- Asset helpers.
- DeFi provider integration.
- React hooks and UI primitives.

AppKit does not replace:

- Wallet security.
- Smart contract validation.
- Backend order verification.
- RPC provider reliability.
- Product-specific business logic.

### `/appkit/concepts/appkit-instance`

Explains the AppKit instance as the central object.

Include lifecycle:

```text
configure -> initialize -> connect wallet -> perform actions -> observe state -> disconnect or restore session
```

### `/appkit/concepts/wallets-and-connectors`

Explains wallets, connectors, selected wallet, and connector capabilities.

### `/appkit/concepts/sessions`

Explains connection persistence and reconnect behavior.

### `/appkit/concepts/networks`

Explains mainnet/testnet, chain selection, provider selection, address formats, and mismatch handling.

### `/appkit/concepts/providers`

Explains RPC/data providers and DeFi providers.

### `/appkit/concepts/transactions`

Explains transaction request construction, messages, payloads, state init, expiry, wallet confirmation, and tracking.

### `/appkit/concepts/assets`

Explains Toncoin, jettons, NFTs, balances, and metadata.

### `/appkit/concepts/react-integration`

Explains how React hooks and components wrap AppKit core.

### `/appkit/concepts/errors`

Explains failure classes and recovery patterns.

## Build section

Build pages are Telegram-style feature guides. Each page solves one product problem.

Use this template:

```text
# Page title in frontmatter only

One sentence saying what the guide does.

## Before you begin
## Basic flow
## Code
## Handling errors
## Related methods
```

Pages:

### `/appkit/build/connect-wallets`

How to connect, disconnect, restore, and read selected wallet state.

### `/appkit/build/send-toncoin`

How to send TON and track the transaction.

### `/appkit/build/send-jettons`

How to show jetton balances and send jettons.

### `/appkit/build/read-balances`

How to read Toncoin and asset balances.

### `/appkit/build/work-with-nfts`

How to read NFT collections, display NFTs, and transfer an NFT if supported.

### `/appkit/build/sign-data`

How to request signatures and verify them on a backend.

### `/appkit/build/swap-tokens`

How to request quotes and build swap transactions with supported providers.

### `/appkit/build/stake-toncoin`

How to show staking positions and build staking transactions.

### `/appkit/build/track-transactions`

How to wait for a transaction, poll status, and handle expired or rejected requests.

### `/appkit/build/handle-network-changes`

How to keep UI safe when users switch network or wallet.

### `/appkit/build/build-checkout`

A compact production-style checkout guide. This replaces the idea that the long tutorial is the main AppKit story.

## Examples section

Examples are complete flows, not documentation chapters.

Each example page should contain:

- What the example demonstrates.
- Dependencies.
- File tree.
- How to run it.
- Important code paths.
- Links to relevant build pages and reference entries.

Examples:

- Minimal React app
- Event ticket checkout
- Jetton checkout
- NFT ticket
- Swap widget
- Staking widget

This keeps tutorial content available but stops it from defining the docs architecture.

## Reference section

Reference should feel closest to Bot API and TL schema pages.

Main pages:

### `/appkit/reference`

Reference hub. Lists packages and links to specific reference groups.

### `/appkit/reference/packages`

Package entrypoints and import rules:

- `@ton/appkit`
- `@ton/appkit/queries`
- `@ton/appkit/swap/omniston`
- `@ton/appkit/swap/dedust`
- `@ton/appkit/staking/tonstakers`
- `@ton/appkit-react`
- `@ton/appkit-react/styles.css`

### `/appkit/reference/appkit`

The `AppKit` class/object and lifecycle methods.

### `/appkit/reference/actions`

Core functions grouped like a protocol method list.

Entry template:

```text
### transferTon

Use this function to send Toncoin from the selected wallet. On success, a wallet transaction response is returned.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| appKit | AppKit | Yes | AppKit instance. |
| parameters | TransferTonParameters | Yes | Transfer parameters. |

Returns: Promise<TransferTonReturnType>.
```

### `/appkit/reference/react`

React hooks.

Entry template:

```text
### useTransferTon

Use this hook to request a Toncoin transfer from React.

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| parameters | UseTransferTonParameters | Optional | Mutation options. |

Returns: UseTransferTonReturnType.
```

### `/appkit/reference/components`

React components and props.

Use `Field | Type | Description` tables.

### `/appkit/reference/queries`

Query keys, query options, mutation options, and cache behavior.

### `/appkit/reference/types`

Object/type reference.

Entry template:

```text
### AppKitConfig

This object configures networks, connectors, providers, and default AppKit behavior.

| Field | Type | Description |
| --- | --- | --- |
| networks | NetworkConfig[] | Networks available to the app. |
| connectors | Connector[] | Optional. Wallet connectors available to users. |
```

### `/appkit/reference/defi-providers`

Omniston, DeDust, and Tonstakers public provider APIs.

### `/appkit/reference/errors`

Error names, reasons, and recovery advice.

## Schema section

Telegram has TL schema pages. AppKit should have schema-like pages for important request/config objects.

These are not guides. They are canonical object definitions.

Pages:

- `AppKitConfig`
- `TransactionRequest`
- `SignDataRequest`
- `Wallet`
- `Connector`
- `Network`
- `Jetton`
- `NFT`
- `Swap`
- `Staking`

Each schema page should include:

- Definition.
- Fields table.
- Minimal JSON or TypeScript shape.
- Related methods.
- Version notes.

## FAQ page

Telegram FAQ pages are long, direct, and anchorable. AppKit needs one.

Example questions:

- What is AppKit?
- Is AppKit a wallet?
- Does AppKit store private keys?
- Which wallets are supported?
- Can I use AppKit without React?
- Can I use AppKit on the server?
- How do I switch between mainnet and testnet?
- How do I know a transaction succeeded?
- Why does a wallet reject a transaction?
- How do I verify signed data?
- How do I handle jetton decimals?
- What data must be verified on the backend?

Answers should be short and link to concepts, build pages, and reference entries.

## Releases section

Telegram treats product updates as first-class. AppKit should do the same.

Pages:

- `/appkit/releases`
- `/appkit/releases/changelog`
- `/appkit/releases/upgrade-guides`
- `/appkit/releases/deprecations`

Release entries should include:

- Date and version.
- Added APIs.
- Changed behavior.
- Deprecated APIs.
- Migration notes.
- Compatibility with package versions.

Style:

```text
## AppKit 0.x

Released on ...

- Added ...
- Changed ...
- Deprecated ...
```

## Visual and interaction direction

If this were outside Mintlify, the site would use:

- White background.
- Telegram blue links.
- Light gray separators.
- Narrow readable content column.
- Simple top navigation.
- Anchor links for every major heading.
- Plain tables.
- Plain code blocks.
- No heavy hero graphics.
- No marketing cards in developer pages.

When implemented inside any docs framework, preserve the behavior even if exact styling differs.

## Writing rules

Use Telegram/Core voice.

Do:

- Start with the answer.
- Use short paragraphs.
- Prefer exact nouns over abstractions.
- Use stable terms: AppKit instance, connector, wallet, selected wallet, transaction request, provider, hook, component.
- Say what succeeds and what can fail.
- Link aggressively to canonical pages.
- Use `Note:` for small caveats.
- Use tables for fields and parameters.

Do not:

- Sell the feature.
- Write long narrative introductions.
- Hide important details behind cards.
- Repeat the same setup on every page.
- Mix tutorials with reference.
- Use the long checkout tutorial as the docs spine.

## Content examples

Telegram-style concept opening:

```text
An AppKit instance stores configuration, connector state, selected wallet state, and provider access for one application. Create one instance per app runtime and pass it to actions, hooks, or providers.
```

Telegram-style build opening:

```text
Use this guide to connect a user's wallet, read the selected address, and restore the connection after a page reload.
```

Telegram-style reference opening:

```text
Use transferTon to request a Toncoin transfer from the selected wallet. The wallet displays the request to the user and returns after the user approves or rejects it.
```

Telegram-style FAQ answer:

```text
No. AppKit does not store private keys. Wallets sign transactions and data. AppKit prepares requests and sends them to the selected wallet through a connector.
```

## Build order

Build the new docs in this order:

1. Write the greenfield `AppKit` home page.
1. Write Start pages: installation, quick start, configuration, wallet connection, first transaction, production.
1. Write Concepts pages so terminology is stable.
1. Write Build pages for wallet, Toncoin, jettons, NFTs, signing, swaps, staking, transaction tracking, and network handling.
1. Convert the Event Ticket Checkout into an Example, not the main tutorial spine.
1. Generate or audit Reference pages from public package exports.
1. Add Schema pages for canonical request/config objects.
1. Add FAQ and Releases.
1. Only then map this structure into the existing docs host.

## Mapping to the current repo

This section is intentionally last. It is not the design driver.

If implemented in the current TON Docs repo:

- Treat the AppKit tab as a host for the greenfield tree.
- Rename groups to `Start`, `Concepts`, `Build`, `Examples`, `Reference`, and `Releases`.
- Add new pages instead of forcing old pages to carry new roles.
- Move old tutorial chapters under Examples or replace them with a single example flow.
- Keep redirects only as a migration concern.
- Keep Mintlify components minimal so the content still feels like Telegram docs.

## Acceptance criteria

The plan succeeds when the AppKit docs can be described without mentioning legacy TON Docs structure.

A finished implementation should satisfy:

- The first screen defines AppKit and routes readers by intent.
- The docs have a shallow Telegram-like top-level structure.
- Concepts are separate from build guides.
- Examples are complete apps or flows, not the main navigation spine.
- Reference pages are canonical and table-driven.
- Schema pages define important objects directly.
- FAQ answers common developer concerns without requiring a tutorial.
- Releases and migrations are first-class.
- The final content would still make sense if hosted at `core.telegram.org/appkit`.
