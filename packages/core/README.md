# @web3-app-kit/core

Headless wallet-connection engine for EVM, Solana and Bitcoin dApps. No DOM, no framework — just a
config object, a reactive store, connectors and actions, built on
[viem](https://viem.sh).

```bash
npm install @web3-app-kit/core viem
```

## Usage

```ts
import { createConfig, connect, watchAccount, injected } from '@web3-app-kit/core'
import { mainnet, base } from '@web3-app-kit/core/chains'
import { http } from 'viem'

const config = createConfig({
  chains: [mainnet, base],
  connectors: [injected()],
  transports: { [mainnet.id]: http(), [base.id]: http() },
})

watchAccount(config, ({ status, address }) => console.log(status, address))

await connect(config, { connector: 'injected' })
```

## `createConfig`

| Option | Default | Description |
| --- | --- | --- |
| `chains` | — | Supported chains. The first is the default. |
| `otherChains` | `[]` | Solana/Bitcoin chains, which are not viem chains. |
| `connectors` | `[]` | Connector factories. Each declares its namespace. |
| `transports` | public RPC | Per-chain viem transport. |
| `storage` | `localStorage` | Pass `null` to disable persistence. |
| `ssr` | `false` | Skip browser-only work on the server. |
| `multiInjectedProviderDiscovery` | `true` | Register EIP-6963 wallets automatically. |
| `autoReconnect` | `true` | Restore the previous session on creation. |

## Actions

`connect` · `disconnect` · `switchChain` · `getAccount` · `watchAccount` ·
`getChainId` · `watchChainId` · `getPublicClient` · `getWalletClient` ·
`getBalance` · `signMessage` · `sendTransaction` · `getEnsName` · `getEnsAvatar` ·
`getWalletInfo`

Every action takes the config as its first argument, so they are trivially
testable and tree-shakeable.

## Connectors

- `injected(options?)` — any EIP-1193 wallet on the page, with a disconnect shim
  and `wallet_addEthereumChain` fallback.
- `walletConnect({ projectId })` — WalletConnect v2, lazily loaded. Emits
  `display_uri` messages instead of opening its own modal.
- `coinbaseWallet({ appName })` — extension, mobile and Smart Wallet.
- `solana({ wallet })` — one Wallet Standard wallet. Discovery registers these
  automatically whenever the config has a Solana chain.
- `bitcoinWallets()` — UniSat, Xverse, Leather and OKX. Bitcoin has no
  discovery standard, so each wallet's injected API is adapted by hand; the two
  shapes in the wild (`unisat`-style and `request`-style) are implemented once
  each and the wallets themselves are data.
- EIP-6963 discovery is automatic; `discoverProviders()` exposes a one-shot scan.

`getWalletInfo(config)` reports which wallet is actually connected. EIP-6963
wallets and WalletConnect peers supply their own name and logo; a wallet that
only takes over `window.ethereum` is named by `detectInjectedWallet()`, which
matches provider flags (`isRabby`, `isAvalanche` → Core, `isBraveWallet`, …)
and deliberately checks `isMetaMask` last, since most wallets set it too.

## State

State is keyed by CAIP-2 namespace, because the connections are independent:

```ts
type State = {
  connections: Partial<Record<ChainNamespace, Connection>>
  statuses: Partial<Record<ChainNamespace, ConnectionStatus>>
  chainIds: Partial<Record<ChainNamespace, ChainId>>
  errors: Partial<Record<ChainNamespace, Error>>
  /** Connector id mid-handshake, kept out of `connections` so a half-built
      connection is never published. */
  pending: Partial<Record<ChainNamespace, string>>
}
```

Read it through `getAccount(config, { namespace })` rather than directly —
that returns a stable snapshot suited to `useSyncExternalStore`. Subscribe with
`config.subscribe(listener)` or `config.subscribeWith(selector, listener)` for
a change-filtered slice.

MIT
