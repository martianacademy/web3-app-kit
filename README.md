# web3-app-kit

[![CI](https://github.com/martianacademy/web3-app-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/martianacademy/web3-app-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.base.json)

Open-source wallet connection SDK for **EVM, Solana and Bitcoin** — a headless
core, a themeable modal, and React bindings. Built directly on
[viem](https://viem.sh); no wagmi, no ethers, no vendor lock-in.

```tsx
import { ConnectButton, Web3AppKitProvider, createConfig, injected } from '@web3-app-kit/react'
import { mainnet, base } from '@web3-app-kit/core/chains'

const config = createConfig({ chains: [mainnet, base], connectors: [injected()] })

export default function App() {
  return (
    <Web3AppKitProvider config={config}>
      <ConnectButton />
    </Web3AppKitProvider>
  )
}
```

## Packages

| Package | What it is |
| --- | --- |
| [`@web3-app-kit/core`](packages/core) | Headless connection engine: config, state store, connectors, actions. No DOM. |
| [`@web3-app-kit/chains`](packages/chains) | Metadata, RPC endpoints and logos for all 2,725 EVM chains. |
| [`@web3-app-kit/ui`](packages/ui) | The connect modal as a web component. Renders chain logos. |
| [`@web3-app-kit/react`](packages/react) | Provider, hooks and `<ConnectButton />`. |
| [`@web3-app-kit/swap`](packages/swap) | Swap quotes, approvals and execution through DODO's HTTP API. Headless. |
| [`@web3-app-kit/swap-widget`](packages/swap-widget) | DODO's own swap UI, driven by your existing connection. **GPL-3.0** — opt in knowingly. |

Each layer is usable on its own. Use `core` alone if you are building your own
UI; use `ui` from any framework, or none at all.

## Multiple ecosystems at once

Connections are keyed by CAIP-2 namespace and are **independent**: connecting a
Solana wallet does not evict an EVM one, which is what multi-chain dApps need.

```ts
import { createConfig, injected, bitcoinWallets, solanaMainnet, bitcoinMainnet } from '@web3-app-kit/core'
import { mainnet } from '@web3-app-kit/core/chains'

const config = createConfig({
  chains: [mainnet],                                // EVM (viem chains)
  otherChains: [solanaMainnet, bitcoinMainnet],     // everything else
  connectors: [injected(), ...bitcoinWallets()],    // Solana is auto-discovered
})
```

```tsx
const evm = useAccount()                            // eip155 by default
const sol = useAccount({ namespace: 'solana' })
const btc = useAccount({ namespace: 'bip122' })
```

| Ecosystem | Discovery | Wallets |
| --- | --- | --- |
| `eip155` | EIP-6963 | Every injected wallet, plus WalletConnect and Coinbase |
| `solana` | Wallet Standard | Phantom, Solflare, Backpack — anything that registers |
| `bip122` | none exists | UniSat, Xverse, Leather, OKX, each adapted explicitly |

The modal groups wallets by ecosystem, and the account view gets tabs once more
than one is connected.

## Features

- **EIP-6963 multi-wallet discovery** — every installed extension is listed by
  name and icon instead of fighting over `window.ethereum`.
- **Every EVM chain, with logos** — a searchable registry of 2,726 networks
  with public RPC endpoints, explorers and 1,934 logos, loaded lazily so you
  only download it if you use it. The 160 chains dApps actually use ship their
  logos inside the package at 128px, so the common case needs no network at
  all — plus an address-keyed index of 1,849 **token** logos.
- **WalletConnect v2** with an in-house QR renderer, loaded lazily so dApps that
  never open the QR view do not pay for the relay client.
- **Coinbase Wallet**, including Smart Wallet (passkeys).
- **Session persistence** and silent reconnect on reload, gated on the wallet
  still authorizing the dApp.
- **Chain switching** from a grid of large hexagonal network marks, with automatic
  `wallet_addEthereumChain` fallback and `config.addChain()` to register a
  chain the user picked at runtime.
- **Receive view** — a QR of the connected address with a one-press copy
  button and the network it belongs to, drawn by the same in-house encoder.
- **Themeable modal** in light, dark or system mode, styled with shadcn/ui's
  default theme and isolated in a shadow root so your app's CSS cannot break
  it. On phones it becomes a swipe-to-dismiss bottom sheet.
- **Typed end to end**, ESM + CJS, tree-shakeable, SSR-safe.

## Install

```bash
npm install @web3-app-kit/react viem
```

`viem` is a peer dependency. `@walletconnect/ethereum-provider` and
`@coinbase/wallet-sdk` are optional peers — install them only if you register
those connectors.

## Quick start (React)

**1. Create a config.**

```ts
// config.ts
import { createConfig, injected, walletConnect, coinbaseWallet } from '@web3-app-kit/core'
import { mainnet, base, arbitrum } from '@web3-app-kit/core/chains'
import { http } from 'viem'

export const config = createConfig({
  chains: [mainnet, base, arbitrum],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'My dApp' }),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID! }),
  ],
  transports: {
    [mainnet.id]: http('https://eth.merkle.io'),
    [base.id]: http(),
    [arbitrum.id]: http(),
  },
})
```

**2. Wrap your app.**

```tsx
import { Web3AppKitProvider } from '@web3-app-kit/react'
import { config } from './config'

<Web3AppKitProvider
  config={config}
  modal={{ themeMode: 'auto', themeVariables: { accent: '#6366f1' } }}
>
  {children}
</Web3AppKitProvider>
```

**3. Connect.**

```tsx
import { ConnectButton, useAccount, useAppKit } from '@web3-app-kit/react'

function Header() {
  const { address, isConnected } = useAccount()
  const { open } = useAppKit()

  return isConnected ? <ConnectButton showBalance /> : <button onClick={() => open()}>Connect</button>
}
```

## Hooks

| Hook | Returns |
| --- | --- |
| `useAccount()` | `address`, `addresses`, `chain`, `chainId`, `connector`, `status`, `isConnected`, … |
| `useChainId()` | The chain the wallet is on |
| `useConnectors()` | Every registered connector, including discovered wallets |
| `useConnect()` | `connect`, `connectAsync`, `isPending`, `error`, `connectors` |
| `useDisconnect()` | `disconnect`, `disconnectAsync` |
| `useSwitchChain()` | `switchChain`, `switchChainAsync`, `chains` |
| `useBalance()` | Native balance with `formatted`, `symbol`, `decimals` |
| `useSignMessage()` | `signMessage`, `signMessageAsync`, `data` |
| `useSendTransaction()` | `sendTransaction`, `sendTransactionAsync`, `data` |
| `useEnsName()` / `useEnsAvatar()` | Mainnet ENS resolution, `null` when mainnet is not configured |
| `usePublicClient()` / `useWalletClient()` | Raw viem clients |
| `useWalletInfo()` | Which wallet is connected — MetaMask, Core, Rainbow — with its own logo |
| `useSwapRequest(fn)` | Registers the modal's Swap entry; it only appears while a handler is set |
| `useTokenIcon()` | Logo URL for an ERC-20, looked up by chain and contract address |
| `useWalletIcon()` | The connected wallet's logo — its own, or a bundled one |
| `useAppKit()` | `open`, `close`, `isOpen` — controls the modal. `open({ view: 'Receive' })` shows the address QR |
| `useChainSearch()` | Ranked search across all 2,725 chains |
| `useChainIcon()` / `useChainIconUrls()` | Chain logo, with gateway fallbacks |
| `useChainEntry()` / `useChainRegistry()` | Registry metadata for a chain, or the whole registry |

## Knowing which wallet is connected

```tsx
const { data: wallet } = useWalletInfo()
// { name: 'Core', icon: 'data:image/svg+xml;…', rdns: 'app.core.extension' }
```

How much is knowable depends on how the wallet connected:

| Connector | Name | Logo |
| --- | --- | --- |
| EIP-6963 wallet | from its announcement | from its announcement |
| WalletConnect | from the session's peer metadata — the real wallet, not "WalletConnect" | from the same metadata |
| `window.ethereum` only | sniffed from provider flags (`isRabby`, `isAvalanche` → Core, …) | none — the wallet never offered one |
| Coinbase Wallet SDK | static | none |

The flag table checks every distinctive flag **before** `isMetaMask`, because
most wallets also set `isMetaMask` so that dApps sniffing for it keep working;
checking it first would report all of them as MetaMask.

The modal shows this under the balance in the account view.

## Any chain, with its logo

`@web3-app-kit/chains` ships the whole EVM chain list. Search it, then add the
result to a live config:

```tsx
import { toViemChain, useChainSearch, useConfig, useSwitchChain } from '@web3-app-kit/react'

function ChainPicker() {
  const config = useConfig()
  const { switchChainAsync } = useSwitchChain()
  const { results } = useChainSearch('zksync', { requireRpc: true })

  return results.map((entry) => (
    <button
      key={entry.id}
      onClick={async () => {
        config.addChain(toViemChain(entry))       // RPC + explorer from the registry
        await switchChainAsync({ chainId: entry.id })
      }}
    >
      {entry.name} · {entry.nativeCurrency.symbol}
    </button>
  ))
}
```

The modal picks logos up automatically. See
[`packages/chains`](packages/chains) for the data shape, the two logo sources
and how to self-host them.

## Swapping

The modal has no swap UI of its own. DODO's widget is React and injects its
styles into `document.head`, so it cannot render inside the modal's shadow
root — the modal closes and hands the request to you instead:

```tsx
import { useSwapRequest } from '@web3-app-kit/react'
import { DodoSwapDialog, useTokenList } from '@web3-app-kit/swap-widget'
import { SwapWidget } from '@dodoex/widgets' // GPL-3.0, installed by you

function Swap() {
  const [open, setOpen] = useState(false)
  const { tokens } = useTokenList()

  // Registers the modal's Swap entry. Without a handler it never appears.
  useSwapRequest(() => setOpen(true))

  return (
    <DodoSwapDialog
      open={open}
      onClose={() => setOpen(false)}
      config={config}
      widget={SwapWidget}
      apikey={import.meta.env.VITE_DODO_API_KEY}
      crossChain
      tokenList={tokens}
    />
  )
}
```

The widget reuses the wallet this SDK already connected, so there is no second
connect flow. Two things are easy to get wrong and are handled for you:

- **`SwapWidget`, not `Widget`.** `Widget` is only the shell — theme, context
  and a toast layer — and renders no swap at all.
- **The token list is yours to supply.** DODO's widget never fetches one; left
  alone it falls back to 66 bundled tokens across 10 chains, with no Base,
  Linea, Scroll, Mantle or zkSync. `useTokenList` merges the public lists,
  deduplicates by address and prepends each chain's native coin.

Prefer no GPL and no 1,000-package dependency? `@web3-app-kit/swap` (MIT) gives
you quotes, allowances and execution directly, and you draw the UI.

## Without React

The core is framework-agnostic. Everything the hooks do is a plain function:

```ts
import { connect, disconnect, watchAccount, injected, createConfig } from '@web3-app-kit/core'
import { createModal } from '@web3-app-kit/ui'
import { mainnet } from '@web3-app-kit/core/chains'

const config = createConfig({ chains: [mainnet], connectors: [injected()] })
const modal = createModal({ config, themeMode: 'dark' })

watchAccount(config, (account) => console.log(account.status, account.address))

document.querySelector('#connect')!.addEventListener('click', () => modal.open())
```

## Theming

The modal ships with [shadcn/ui](https://ui.shadcn.com)'s default (neutral)
theme — the same semantic tokens, radius scale and button shapes, hand-written
as plain CSS with hex fallbacks for browsers without `oklch()`.

**In a shadcn app, turn on `inheritHostTheme` and you are done.** Custom
properties inherit across the shadow boundary, so the modal reads `--popover`,
`--primary`, `--border`, `--radius` and friends straight off your page and
follows your own `.dark` switch:

```ts
createModal({ config, inheritHostTheme: true })
```

Anywhere else, override the tokens directly:

```ts
createModal({
  config,
  themeMode: 'auto',        // 'light' | 'dark' | 'auto'
  themeVariables: {
    primary: '#6366f1',
    primaryForeground: '#ffffff',
    radius: '0.5rem',
    fontFamily: '"Inter", system-ui, sans-serif',
  },
  // Chain logos: `false` to disable, `{ sources: ['ipfs'] }` to skip the
  // third-party icon CDN, or a `gateway` / `cdnBaseUrl` of your own.
  chainIcons: { sources: ['cdn', 'ipfs'] },
})
```

`themeVariables` always wins over the inherited theme. `::part(overlay)` and
`::part(card)` are exposed for anything the tokens do not cover.

`<ConnectButton />` is styled the same way: it reads the host page's shadcn
variables when they exist and falls back to shadcn's own light and dark
defaults otherwise.

## Writing a connector

A connector is a factory that receives the chain list, an emitter and storage:

```ts
import type { CreateConnectorFn } from '@web3-app-kit/core'

export function myWallet(): CreateConnectorFn {
  return ({ chains, emitter }) => ({
    id: 'myWallet',
    name: 'My Wallet',
    type: 'injected',
    emitter,
    async connect() {
      const accounts = await sdk.request({ method: 'eth_requestAccounts' })
      return { accounts, chainId: await sdk.chainId() }
    },
    async disconnect() { await sdk.close() },
    async getAccounts() { return sdk.accounts },
    async getChainId() { return sdk.chainId() },
    async getProvider() { return sdk.provider },
    async isAuthorized() { return sdk.accounts.length > 0 },
  })
}
```

Emit `change`, `connect`, `disconnect` and `error` on the emitter and the config
store keeps itself in sync. Emit `message` with `type: 'display_uri'` to make
the modal render a QR code.

## Development

```bash
pnpm install
pnpm build      # build all packages
pnpm test       # vitest
pnpm typecheck
pnpm example    # run the Vite example on :5173

pnpm --filter @web3-app-kit/chains generate   # refresh the chain dataset
```

The example in [`examples/vite-react`](examples/vite-react) exercises every part
of the SDK — discovery, connect, chain switching, signing and the modal.

## Attribution

Chain metadata comes from
[ethereum-lists/chains](https://github.com/ethereum-lists/chains), and the
chain, token and wallet logos from
[web3icons](https://github.com/0xa3k5/web3icons) with a few overrides from
[trustwallet/assets](https://github.com/trustwallet/assets). All three are MIT.
Runtime icon URLs point at jsDelivr, pinned to a commit, with IPFS gateways as
a fallback.

Full notices, and what a software licence does *not* grant you over a
trademarked logo, in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## License

MIT — every package except one.

`@web3-app-kit/swap-widget` is GPL-3.0-or-later, because it wraps
`@dodoex/widgets`, which is. It is published separately and nothing else here
depends on it, so taking the SDK on does not take GPL on.

Chain, token and wallet metadata and logos are generated from MIT-licensed
projects and keep their own copyright. The logos are trademarks of their
owners regardless of any software licence — see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
