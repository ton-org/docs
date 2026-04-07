/**
 * Copyright (c) TON Docs.
 *
 * This source code is licensed under the GNU General Public License v3.0 license
 * found in the LICENSE file in the root directory of: https://github.com/ton-community/ton-docs
 */

/** @type {import('./sidebars.d.ts').SidebarsConfig} */
const sidebars = {
  learn: [
    'v3/concepts/dive-into-ton/introduction',
    {
      type: 'category',
      label: 'TON Ecosystem',
      items: [
        'v3/concepts/dive-into-ton/ton-ecosystem/wallet-apps',
        'v3/concepts/dive-into-ton/ton-ecosystem/explorers-in-ton',
        'v3/concepts/dive-into-ton/ton-ecosystem/blockchain-tech',
      ],
    },
    {
      type: 'category',
      label: 'TON Blockchain',
      items: [
        'v3/concepts/dive-into-ton/ton-blockchain/overview',
        'v3/concepts/dive-into-ton/ton-blockchain/asynchrony',
        'v3/concepts/dive-into-ton/ton-blockchain/sharding',
        'v3/concepts/dive-into-ton/ton-blockchain/accounts',
        'v3/concepts/dive-into-ton/ton-blockchain/addresses',
        'v3/concepts/dive-into-ton/ton-blockchain/smart-contracts',
        'v3/concepts/dive-into-ton/ton-blockchain/operations',
        `v3/concepts/dive-into-ton/ton-blockchain/ton-virtual-machine`,
        'v3/concepts/dive-into-ton/ton-blockchain/cells',
        'v3/concepts/dive-into-ton/ton-blockchain/nodes',
        'v3/concepts/dive-into-ton/ton-blockchain/network',
        {
          type: 'category',
          label: 'TON vs Ethereum',
          items: [
            'v3/concepts/dive-into-ton/go-from-ethereum/difference-of-blockchains',
            'v3/concepts/dive-into-ton/go-from-ethereum/solidity-vs-func',
            'v3/concepts/dive-into-ton/go-from-ethereum/tvm-vs-evm',
            'v3/concepts/dive-into-ton/go-from-ethereum/blockchain-comparison',
          ],
        },
      ],
    },
    'v3/concepts/security-measures',
    'v3/concepts/educational-resources',
    'v3/concepts/glossary',
  ],
  develop: [
    'v3/documentation/introduction',
    {
      type: 'category',
      label: 'Smart contracts',
      items: [
        'v3/documentation/smart-contracts/overview',
        {
          type: 'category',
          label: 'Development environment',
          items: [
            'v3/documentation/smart-contracts/getting-started/javascript',
            'v3/documentation/smart-contracts/getting-started/ide-plugins',
            'v3/documentation/smart-contracts/getting-started/testnet',
          ],
        },
        {
          type: 'category',
          label: 'Addresses',
          link: { type: 'doc', id: 'v3/documentation/smart-contracts/addresses/address' },
          items: [
            'v3/documentation/smart-contracts/addresses/address',
            'v3/documentation/smart-contracts/addresses/address-formats',
            'v3/documentation/smart-contracts/addresses/address-states',
          ],
        },
        {
          type: 'category',
          label: 'Message management',
          items: [
            'v3/documentation/smart-contracts/message-management/messages-and-transactions',
            'v3/documentation/smart-contracts/message-management/sending-messages',
            'v3/documentation/smart-contracts/message-management/internal-messages',
            'v3/documentation/smart-contracts/message-management/external-messages',
            'v3/documentation/smart-contracts/message-management/non-bounceable-messages',
            'v3/documentation/smart-contracts/message-management/message-modes-cookbook',
            'v3/documentation/smart-contracts/message-management/ecosystem-messages-layout',
          ],
        },
        {
          type: 'category',
          label: 'Transaction fees',
          items: [
            'v3/documentation/smart-contracts/transaction-fees/fees',
            'v3/documentation/smart-contracts/transaction-fees/fees-low-level',
            'v3/documentation/smart-contracts/transaction-fees/accept-message-effects',
            'v3/documentation/smart-contracts/transaction-fees/forward-fees',
          ],
        },
        {
          type: 'category',
          label: 'Sharding',
          items: [
            'v3/documentation/smart-contracts/shards/shards-intro',
            'v3/documentation/smart-contracts/shards/infinity-sharding-paradigm',
          ],
        },
        'v3/documentation/smart-contracts/limits',
        {
          type: 'category',
          label: 'Contracts specification',
          items: [
            'v3/documentation/smart-contracts/contracts-specs/wallet-contracts',
            'v3/documentation/smart-contracts/contracts-specs/highload-wallet',
            'v3/documentation/smart-contracts/contracts-specs/vesting-contract',
            'v3/documentation/smart-contracts/contracts-specs/governance',
            'v3/documentation/smart-contracts/contracts-specs/nominator-pool',
            'v3/documentation/smart-contracts/contracts-specs/single-nominator-pool',
            'v3/documentation/smart-contracts/contracts-specs/precompiled-contracts',
            'v3/documentation/smart-contracts/contracts-specs/examples',

            {
              type: 'link',
              label: 'TON enhancement proposals (TEPs)',
              href: 'https://github.com/ton-blockchain/TEPs/tree/master',
            },

          ],
        },
        {
          type: 'category',
          label: 'Tolk language',
          items: [
            'v3/documentation/smart-contracts/tolk/overview',
            'v3/documentation/smart-contracts/tolk/environment-setup',
            'v3/documentation/smart-contracts/tolk/counter-smart-contract',
            'v3/documentation/smart-contracts/tolk/language-guide',
            'v3/documentation/smart-contracts/tolk/tolk-vs-func/in-short',
            'v3/documentation/smart-contracts/tolk/tolk-vs-func/in-detail',
            'v3/documentation/smart-contracts/tolk/tolk-vs-func/mutability',
            'v3/documentation/smart-contracts/tolk/tolk-vs-func/stdlib',
            'v3/documentation/smart-contracts/tolk/tolk-vs-func/pack-to-from-cells',
            'v3/documentation/smart-contracts/tolk/tolk-vs-func/create-message',
            'v3/documentation/smart-contracts/tolk/tolk-vs-func/lazy-loading',
            'v3/documentation/smart-contracts/tolk/changelog',
          ],
        },
        {
          type: 'category',
          label: 'FunC language',
          items: [
            {
              type: 'doc',
              id: 'v3/documentation/smart-contracts/func/overview',
            },
            {
              type: 'doc',
              id: 'v3/documentation/smart-contracts/func/cookbook',
            },
            {
              type: 'category',
              label: 'Documentation',
              items: [
                'v3/documentation/smart-contracts/func/docs/types',
                'v3/documentation/smart-contracts/func/docs/comments',
                'v3/documentation/smart-contracts/func/docs/literals_identifiers',
                'v3/documentation/smart-contracts/func/docs/functions',
                'v3/documentation/smart-contracts/func/docs/global_variables',
                'v3/documentation/smart-contracts/func/docs/compiler_directives',
                'v3/documentation/smart-contracts/func/docs/statements',
                'v3/documentation/smart-contracts/func/docs/builtins',
                'v3/documentation/smart-contracts/func/docs/dictionaries',
                'v3/documentation/smart-contracts/func/docs/stdlib',
              ],
            },
            'v3/documentation/smart-contracts/func/libraries',
            'v3/documentation/smart-contracts/func/changelog',
          ],
        },
        {
          type: 'category',
          label: 'Fift language',
          items: [
            'v3/documentation/smart-contracts/fift/overview',
            'v3/documentation/smart-contracts/fift/fift-and-tvm-assembly',
            'v3/documentation/smart-contracts/fift/fift-deep-dive',
          ],
        },
        'v3/documentation/smart-contracts/tact',
      ],
    },
    {
      type: 'category',
      label: 'DApps',
      items: [
        'v3/documentation/dapps/dapps-overview',
        {
          type: 'category',
          label: 'Assets',
          items: [
            'v3/documentation/dapps/assets/toncoin',
            'v3/documentation/dapps/assets/jetton',
            'v3/documentation/dapps/assets/nft',
            'v3/documentation/dapps/assets/nft-2.0',
            'v3/documentation/dapps/assets/usdt',
            'v3/documentation/dapps/assets/extra-currencies',
          ],
        },
        {
          type: 'category',
          label: 'DeFi principles',
          items: [
            'v3/documentation/dapps/assets/overview',
            {
              type: 'doc',
              label: 'NFT use cases in TON',
              id: 'v3/documentation/dapps/defi/nft',
            },
            'v3/documentation/dapps/defi/subscriptions',
            'v3/documentation/dapps/defi/ton-payments',
          ],
        },
        {
          type: 'category',
          label: 'Oracles',
          items: [
            'v3/documentation/infra/oracles/overview',
            {
              type: 'category',
              label: 'Providers',
              items: [
                'v3/documentation/infra/oracles/pyth',
                'v3/documentation/infra/oracles/redstone',
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Nodes',
      items: [
        'v3/documentation/nodes/overview',
        {
          type: 'category',
          label: 'Validation',
          items: [
            'v3/documentation/nodes/validation/collators',
            {
              type: 'doc',
              label: 'Proof-of-stake',
              id: 'v3/documentation/nodes/validation/staking-incentives',
            },
            'v3/documentation/dapps/proofs',
            'v3/documentation/dapps/basic-proofing-concepts',
          ],
        },
        {
          type: 'category',
          label: 'MyTonCtrl',
          items: [
            'v3/documentation/nodes/mytonctrl/overview',
            'v3/documentation/nodes/mytonctrl/commands',
            'v3/documentation/nodes/mytonctrl/status',
            'v3/documentation/nodes/mytonctrl/errors',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Infrastructure',
      items: [
        {
          type: 'category',
          label: 'Bridges',
          items: [
            'v3/documentation/infra/bridges/toncoin',
            'v3/documentation/infra/bridges/toncoin-addresses',
          ],
        },
      ]
    },
    {
      type: 'category',
      label: 'Network',
      items: [
        'v3/documentation/network/global-config',
        {
          type: 'category',
          label: 'Config params',
          items: [
            'v3/documentation/network/config-params/overview',
            'v3/documentation/network/config-params/update',
            'v3/documentation/network/config-params/extra-currency',
          ],
        },
        {
          type: 'category',
          label: 'Protocols',
          items: [
            {
              type: 'category',
              label: 'ADNL',
              items: [
                {
                  type: 'doc',
                  label: 'Overview',
                  id: 'v3/documentation/network/protocols/adnl/overview',
                },
                'v3/documentation/network/protocols/adnl/low-level',
                'v3/documentation/network/protocols/adnl/tcp',
                'v3/documentation/network/protocols/adnl/udp',
              ],
            },
            {
              type: 'category',
              label: 'DHT',
              items: [
                {
                  type: 'doc',
                  label: 'Overview',
                  id: 'v3/documentation/network/protocols/dht/overview',
                },
                'v3/documentation/network/protocols/dht/deep-dive',
              ]
            },
            'v3/documentation/network/protocols/rldp',
            'v3/documentation/network/protocols/overlay',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Data formats',
      items: [
        {
          type: 'category',
          label: 'TL-B language',
          items: [
            'v3/documentation/data-formats/tlb/overview',
            'v3/documentation/data-formats/tlb/types',
            'v3/documentation/data-formats/tlb/crc32',
            'v3/documentation/data-formats/tlb/tools',
          ],
        },
        {
          type: 'category',
          label: 'Layouts',
          items: [
            'v3/documentation/data-formats/layout/messages',
            'v3/documentation/data-formats/layout/transactions',
            'v3/documentation/data-formats/layout/blocks',
          ]
        },
        {
          type: 'category',
          label: 'Cells',
          items: [
            'v3/documentation/data-formats/cells/overview',
            'v3/documentation/data-formats/cells/exotic',
            'v3/documentation/data-formats/cells/library',
            'v3/documentation/data-formats/cells/serialization',
          ]
        },
        'v3/documentation/data-formats/tl',
      ],
    },
    {
      type: 'category',
      label: 'Virtual machine',
      items: [
        'v3/documentation/tvm/overview',
        'v3/documentation/tvm/initialization',
        'v3/documentation/tvm/exit-codes',
        {
          type: 'link',
          label: 'Instructions',
          href: '/v3/documentation/tvm/instructions',
        },
        {
          type: 'category',
          label: 'Specification',
          items: [
            'v3/documentation/tvm/specification/runvm',
          ],
        },
        {
          type: 'category',
          label: 'Changelog',
          items: [
            'v3/documentation/tvm/changelog/tvm-upgrade-2025-02',
            'v3/documentation/tvm/changelog/tvm-upgrade-2024-04',
            'v3/documentation/tvm/changelog/tvm-upgrade-2023-07',

          ],
        },
      ]
    },
    {
      type: 'category',
      label: 'Whitepapers',
      items: [
        {
          type: 'doc',
          label: 'Overview',
          id: 'v3/documentation/whitepapers/overview',
        },
        {
          type: 'link',
          label: 'TON',
          href: 'https://docs.ton.org/ton.pdf',
        },
        {
          type: 'link',
          label: 'TON Virtual Machine',
          href: 'https://docs.ton.org/tvm.pdf',
        },
        {
          type: 'link',
          label: 'TON Blockchain',
          href: 'https://docs.ton.org/tblkch.pdf',
        },
        {
          type: 'link',
          label: 'Catchain consensus protocol',
          href: 'https://docs.ton.org/catchain.pdf',
        },
      ],
    },
    'v3/documentation/faq',
  ],
  guidelines: [
    {
      type: 'category',
      label: `Quick start`,
      items: [
        'v3/guidelines/quick-start/getting-started',
        {
          type: 'category',
          label: 'Blockchain interaction',
          items: [
            'v3/guidelines/quick-start/blockchain-interaction/reading-from-network',
            'v3/guidelines/quick-start/blockchain-interaction/writing-to-network',
          ],
        },
        {
          type: 'category',
          label: 'Developing smart contracts',
          items: [
            'v3/guidelines/quick-start/developing-smart-contracts/setup-environment',

            {
              type: 'category',
              label: 'FunC & Tolk implementation',

              items: [
                'v3/guidelines/quick-start/developing-smart-contracts/func-tolk-folder/blueprint-sdk-overview',
                'v3/guidelines/quick-start/developing-smart-contracts/func-tolk-folder/storage-and-get-methods',
                'v3/guidelines/quick-start/developing-smart-contracts/func-tolk-folder/processing-messages',
                'v3/guidelines/quick-start/developing-smart-contracts/func-tolk-folder/deploying-to-network',
              ],
            },


            {
              type: 'category',
              label: 'Tact implementation',
              items: [
                'v3/guidelines/quick-start/developing-smart-contracts/tact-folder/tact-blueprint-sdk-overview',
                'v3/guidelines/quick-start/developing-smart-contracts/tact-folder/tact-storage-and-get-methods',
                'v3/guidelines/quick-start/developing-smart-contracts/tact-folder/tact-deploying-to-network',
              ],
            }
          ],
        }
      ]
    },
    'v3/guidelines/get-started-with-ton',
    {
      type: 'category',
      label: 'TON Hello World series',
      link: {
        type: 'generated-index',
        title: 'TON Hello World series',
        slug: '/guidelines/hello-world',
        keywords: ['HelloWorld'],
      },
      items: [
        {
          type: 'link',
          label: 'Working with your wallet',
          href: 'https://helloworld.tonstudio.io/01-wallet',
        },
        {
          type: 'link',
          label: 'Writing first smart contract',
          href: 'https://helloworld.tonstudio.io/02-contract',
        },
        {
          type: 'link',
          label: 'Building first web client',
          href: 'https://helloworld.tonstudio.io/03-client',
        },
        {
          type: 'link',
          label: 'Testing your smart contract',
          href: 'https://helloworld.tonstudio.io/04-testing',
        },
      ],
    },
    {
      type: 'category',
      label: 'Smart contracts guidelines',
      link: {
        type: 'generated-index',
        title: 'Smart contracts guidelines',
        slug: '/guidelines/smat-contracts-guidelines',
        keywords: ['smart contracts guidelines'],
      },
      items: [
        'v3/guidelines/smart-contracts/guidelines',
        'v3/guidelines/smart-contracts/get-methods',
        {
          type: 'doc',
          label: 'Transaction fees calculation',
          id: 'v3/guidelines/smart-contracts/fee-calculation',
        },
        {
          type: 'category',
          label: 'Testing',
          link: {
            type: 'generated-index',
            title: 'Testing',
            slug: '/guidelines/testing',
            keywords: ['testing'],
          },
          items: [
            'v3/guidelines/smart-contracts/testing/overview',
            'v3/guidelines/smart-contracts/testing/blueprint-config',
            'v3/guidelines/smart-contracts/testing/writing-test-examples',
            'v3/guidelines/smart-contracts/testing/collect-contract-gas-metric',
          ],
        },
        {
          type: 'category',
          label: 'Security measures',
          link: {
            type: 'generated-index',
            title: 'Security measures',
            slug: '/guidelines/security-measures',
            keywords: ['security'],
          },
          items: [
            'v3/guidelines/smart-contracts/security/overview',
            'v3/guidelines/smart-contracts/security/common-vulnerabilities',
            'v3/guidelines/smart-contracts/security/secure-programming',
            'v3/guidelines/smart-contracts/security/things-to-focus',
            'v3/guidelines/smart-contracts/security/ton-hack-challenge-1',
            'v3/guidelines/smart-contracts/security/random-number-generation',
            'v3/guidelines/smart-contracts/security/random',
          ],
        },
        {
          type: 'category',
          label: 'How to',
          link: {
            type: 'generated-index',
            title: 'How to',
            slug: '/guidelines/how-to',
            keywords: ['how to'],
          },
          items: [
            {
              type: 'category',
              label: 'Compile from sources',
              link: {
                type: 'generated-index',
                title: 'Compile from sources',
                slug: '/guidelines/compile-from-sources',
                keywords: ['compile'],
              },
              items: [
                {
                  type: 'doc',
                  label: 'Compilation instructions',
                  id: 'v3/guidelines/smart-contracts/howto/compile/compilation-instructions',
                },
                {
                  type: 'doc',
                  label: 'Instructions for low-memory machines',
                  id: 'v3/guidelines/smart-contracts/howto/compile/instructions-low-memory',
                },
              ],
            },
            'v3/guidelines/smart-contracts/howto/multisig',
            'v3/guidelines/smart-contracts/howto/multisig-js',
            'v3/guidelines/smart-contracts/howto/airdrop-claim-best-practice',
            'v3/guidelines/smart-contracts/howto/shard-optimization',
            'v3/guidelines/smart-contracts/howto/wallet',
            'v3/guidelines/smart-contracts/howto/nominator-pool',
            'v3/guidelines/smart-contracts/howto/single-nominator-pool',
            {
              type: 'link',
              label: 'How to shard your TON smart contract and why',
              href: 'https://blog.ton.org/how-to-shard-your-ton-smart-contract-and-why-studying-the-anatomy-of-tons-jettons',
            },
          ],
        },
      ]
    },
    {
      type: 'category',
      label: 'DApps guidelines',
      link: {
        type: 'generated-index',
        title: 'DApps guidelines',
        slug: '/guidelines/dapps',
        keywords: ['dapps'],
      },
      items: [
        'v3/guidelines/dapps/overview',
        'v3/guidelines/dapps/cookbook',
        {
          type: 'category',
          label: 'Mastering transactions',
          items: [
            'v3/guidelines/dapps/transactions/overview',
            'v3/guidelines/dapps/transactions/foundations-of-blockchain',
            'v3/guidelines/dapps/transactions/message-driven-execution',
            'v3/guidelines/dapps/transactions/hash-based-tracking',
            'v3/guidelines/dapps/transactions/api-based-retrieval',
            'v3/guidelines/dapps/transactions/explore-transactions',
          ],
        },
        {
          type: 'category',
          label: 'Blockchain APIs',
          link: {
            type: 'generated-index',
            title: 'APIs and SDKs',
            slug: '/guidelines/api-sdk',
            keywords: ['api', 'sdk'],
          },
          items: [
            'v3/guidelines/dapps/apis-sdks/overview',
            'v3/guidelines/dapps/apis-sdks/api-types',
            'v3/guidelines/dapps/apis-sdks/sdk',
            'v3/guidelines/dapps/apis-sdks/ton-adnl-apis',
            'v3/guidelines/dapps/apis-sdks/analytics-and-data',
          ],
        },
        {
          type: 'category',
          label: 'Tutorials & examples',
          link: {
            type: 'generated-index',
            title: 'Tutorials & examples',
            slug: '/guidelines/tutorials-and-examples',
            keywords: ['tutorials', 'examples'],
          },
          items: [
            {
              type: 'doc',
              id: 'v3/guidelines/dapps/tutorials/jetton-airdrop',
              label: 'How to launch a jetton airdrop',
            },
            'v3/guidelines/dapps/apis-sdks/api-keys',
            'v3/guidelines/dapps/apis-sdks/getblock-ton-api',
            {
              type: 'doc',
              id: 'v3/guidelines/dapps/tutorials/nft-minting-guide',
              label: 'NFT minting guide',
            },
            {
              type: 'doc',
              id: 'v3/guidelines/dapps/tutorials/mint-your-first-token',
              label: 'Mint your first token',
            },
            {
              type: 'doc',
              id: 'v3/guidelines/dapps/tutorials/zero-knowledge-proofs',
              label: 'Zero-Knowledge proofs',
            },
            {
              type: 'doc',
              id: 'v3/guidelines/dapps/tutorials/web3-game-example',
              label: 'Web3 game example',
            },
            {
              type: 'category',
              label: 'Telegram bot examples',
              link: {
                type: 'generated-index',
                title: 'Telegram bot examples',
                slug: '/guidelines/tg-bot-examples',
                keywords: ['bots', 'examples'],
              },
              items: [
                'v3/guidelines/dapps/tutorials/telegram-bot-examples/accept-payments-in-a-telegram-bot',
                'v3/guidelines/dapps/tutorials/telegram-bot-examples/accept-payments-in-a-telegram-bot-2',
                'v3/guidelines/dapps/tutorials/telegram-bot-examples/accept-payments-in-a-telegram-bot-js',

                {
                  type: 'link',
                  label: 'TMA USD₮ payments demo',
                  href: 'https://github.com/ton-community/tma-usdt-payments-demo',
                },

              ],
            },
          ],
        },
        {
          type: 'category',
          label: 'Telegram Mini Apps',
          link: {
            type: 'generated-index',
            title: 'Telegram Mini Apps',
            slug: '/guidelines/tma',
            keywords: ['tma', 'mini apps'],
          },
          items: [
            'v3/guidelines/dapps/tma/overview',
            {
              type: 'category',
              label: 'Guidelines',
              link: {
                type: 'generated-index',
                title: 'TMA guidelines',
                slug: '/guidelines/tma-guidelines',
                keywords: ['tma'],
              },
              items: [
                'v3/guidelines/dapps/tma/guidelines/testing-apps',
                'v3/guidelines/dapps/tma/guidelines/publishing',
                'v3/guidelines/dapps/tma/guidelines/monetization',
                'v3/guidelines/dapps/tma/guidelines/tips-and-tricks',
              ],
            },
            {
              type: 'category',
              label: 'Tutorials & examples',
              link: {
                type: 'generated-index',
                title: 'TMA tutorials & examples',
                slug: '/guidelines/tma-tutorials-and-examples',
                keywords: ['tma', 'tutorials', 'examples'],
              },
              items: [
                'v3/guidelines/dapps/tma/tutorials/step-by-step-guide',
                'v3/guidelines/dapps/tma/tutorials/app-examples',
                'v3/guidelines/dapps/tma/tutorials/design-guidelines',
              ],
            },
          ],
        },
        {
          type: 'category',
          label: 'Advanced asset processing',
          link: {
            type: 'generated-index',
            title: 'Advanced asset processing',
            slug: '/guidelines/advanced-asset-processing',
            keywords: ['assets'],
          },
          items: [
            'v3/guidelines/dapps/asset-processing/payments-processing',
            'v3/guidelines/dapps/asset-processing/jettons',
            'v3/guidelines/dapps/asset-processing/mintless-jettons',
            'v3/guidelines/dapps/asset-processing/compressed-nfts',
            'v3/guidelines/dapps/asset-processing/mass-mint-tools',
            {
              type: 'category',
              label: 'NFT processing',
              link: {
                type: 'generated-index',
                title: 'NFT processing',
                slug: '/guidelines/nft-processing',
                keywords: ['nft'],
              },
              items: [
                'v3/guidelines/dapps/asset-processing/nft-processing/nfts',
                'v3/guidelines/dapps/asset-processing/nft-processing/metadata-parsing',
              ],
            },
          ],
        },
      ]
    },
    {
      type: 'category',
      label: 'Blockchain nodes guidelines',
      link: {
        type: 'generated-index',
        title: 'Blockchain nodes guidelines',
        slug: '/guidelines/nodes-guidelines',
        keywords: ['nodes'],
      },
      items: [
        'v3/guidelines/nodes/overview',
        {
          type: 'category',
          label: 'Running nodes',
          link: {
            type: 'generated-index',
            title: 'Running nodes',
            slug: '/guidelines/running-nodes',
            keywords: ['running nodes'],
          },
          items: [
            'v3/guidelines/nodes/running-nodes/archive-node',
            'v3/guidelines/nodes/running-nodes/full-node',
            'v3/guidelines/nodes/running-nodes/liteserver-node',
            'v3/guidelines/nodes/running-nodes/validator-node',
            'v3/guidelines/nodes/running-nodes/collators-validators',
            'v3/guidelines/nodes/running-nodes/staking-with-nominator-pools',
            'v3/guidelines/nodes/running-nodes/run-mytonctrl-docker',
            'v3/guidelines/nodes/running-nodes/running-a-local-ton',
            'v3/guidelines/nodes/running-nodes/secure-guidelines',
          ],
        },
        {
          type: 'category',
          label: 'Maintenance guidelines',
          link: {
            type: 'generated-index',
            title: 'Maintenance guidelines',
            slug: '/guidelines/maintenance-guidelines',
            keywords: ['maintenance'],
          },
          items: [
            'v3/guidelines/nodes/maintenance-guidelines/mytonctrl-backup-restore',
            'v3/guidelines/nodes/maintenance-guidelines/mytonctrl-validator-standby',
            'v3/guidelines/nodes/maintenance-guidelines/mytonctrl-private-alerting',
            'v3/guidelines/nodes/maintenance-guidelines/mytonctrl-prometheus',
            'v3/guidelines/nodes/maintenance-guidelines/mytonctrl-remote-controller'
          ],
        },
        'v3/guidelines/nodes/custom-overlays',
        'v3/guidelines/nodes/nodes-troubleshooting',
        'v3/guidelines/nodes/node-maintenance-and-security',
        'v3/guidelines/nodes/monitoring/performance-monitoring',
        'v3/guidelines/nodes/persistent-states',
        'v3/guidelines/nodes/faq',
      ]
    },
    {
      label: 'TON Connect',
      type: 'category',
      link: {
        type: 'generated-index',
        title: 'TON Connect',
        slug: '/guidelines/ton-connect',
      },

      items: [
        // 1. Overview
        'v3/guidelines/ton-connect/overview',

        // 2. Quick-start
        'v3/guidelines/ton-connect/quick-start',

        // 3. DApp Guide
        {
          type: 'category',
          label: 'DApp guide',
          link: {
            type: 'generated-index',
            title: 'DApp guide',
            slug: '/guidelines/dapp-guide',
          },
          items: [
            'v3/guidelines/ton-connect/creating-manifest',
            {
              type: 'category',
              label: 'SDK installation',
              link: {
                type: 'generated-index',
                title: 'SDK installation',
                slug: '/guidelines/install-ton-connect',
                keywords: ['TON Connect'],
              },
              items: [
                {
                  type: 'doc',
                  id: 'v3/guidelines/ton-connect/frameworks/react',
                  label: 'React apps',
                },
                {
                  type: 'doc',
                  id: 'v3/guidelines/ton-connect/frameworks/web',
                  label: 'HTML/JS apps',
                },
                {
                  type: 'doc',
                  id: 'v3/guidelines/ton-connect/frameworks/python',
                  label: 'Python apps',
                },
              ],
            },
            'v3/guidelines/ton-connect/verifying-signed-in-users',
          ],
        },

        // 4. Payload Cookbook
        {
          type: 'category',
          label: 'Transaction cookbook',
          link: {
            type: 'generated-index',
            title: 'Transaction cookbook',
            slug: '/guidelines/cookbook',
          },
          items: [
            'v3/guidelines/ton-connect/cookbook/cells',
            'v3/guidelines/ton-connect/cookbook/ton-transfer',
            'v3/guidelines/ton-connect/cookbook/jetton-transfer',
            'v3/guidelines/ton-connect/cookbook/nft-transfer',
          ],
        },

        // 5. Transaction lookup
        {
          type: 'doc',
          label: 'Transaction lookup',
          id: 'v3/guidelines/ton-connect/guidelines/transaction-by-external-message',
        },

        // 6. Wallet Integration
        {
          type: 'doc',
          label: 'Wallet integration',
          id: 'v3/guidelines/ton-connect/wallet',
        },

        // 7. Developers reference
        'v3/guidelines/ton-connect/guidelines/developers',

        // 8. Advanced
        {
          type: 'category',
          label: 'Advanced',
          link: {
            type: 'generated-index',
            title: 'Advanced',
            slug: '/guidelines/advanced',
          },
          items: [
            {
              type: 'link',
              label: 'Protocol specification',
              href: 'https://github.com/ton-blockchain/ton-connect',
            },
            {
              type: 'link',
              label: 'Wallets list',
              href: 'https://github.com/ton-blockchain/wallets-list',
            },
          ],
        },

      ],

    },
    {
      type: 'category',
      label: 'Web3 guidelines',
      link: {
        type: 'generated-index',
        title: 'Web3 guidelines',
        slug: '/guidelines/web3-guidelines',
        keywords: ['web3'],
      },
      items: [
        'v3/guidelines/web3/overview',
        {
          type: 'category',
          label: 'TON DNS',
          link: {
            type: 'generated-index',
            title: 'TON DNS',
            slug: '/guidelines/ton-dns',
            keywords: ['dns'],
          },
          items: [
            'v3/guidelines/web3/ton-dns/dns',
            'v3/guidelines/web3/ton-dns/subresolvers',
          ],
        },
        {
          type: 'category',
          label: 'Proxy & sites',
          link: {
            type: 'generated-index',
            title: 'Proxy & sites',
            slug: '/guidelines/proxy-and-sites',
            keywords: ['proxy-and-sites'],
          },
          items: [
            'v3/guidelines/web3/ton-proxy-sites/how-to-run-ton-site',
            'v3/guidelines/web3/ton-proxy-sites/ton-sites-for-applications',
            'v3/guidelines/web3/ton-proxy-sites/connect-with-ton-proxy',
            'v3/guidelines/web3/ton-proxy-sites/how-to-open-any-ton-site',
            'v3/guidelines/web3/ton-proxy-sites/site-and-domain-management',
            'v3/guidelines/web3/ton-proxy-sites/running-your-own-ton-proxy',
          ],
        },
        {
          type: 'category',
          label: 'TON Storage',
          link: {
            type: 'generated-index',
            title: 'TON Storage',
            slug: '/guidelines/ton-storage',
            keywords: ['storage'],
          },
          items: [
            'v3/guidelines/web3/ton-storage/storage-daemon',
            'v3/guidelines/web3/ton-storage/storage-provider',
            'v3/guidelines/web3/ton-storage/storage-faq',
          ],
        },
      ]
    },
  ],
  contribute: [
    'v3/contribute/README',
    {
      'type': 'category',
      'label': 'Contribute guidelines',
      'items': [
        'v3/contribute/style-guide',
        'v3/contribute/content-standardization',
        'v3/contribute/typography',
        {
          type: 'doc',
          label: 'Translation style guide',
          id: 'v3/contribute/localization-program/translation-style-guide',
        },
      ],

    },
    'v3/contribute/maintainers',
  ],
};

module.exports = sidebars;
