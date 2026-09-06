# @web3-app-kit/react

React bindings for [web3-app-kit](https://github.com/): a provider, hooks and a
drop-in connect button.

```bash
npm install @web3-app-kit/react viem
```

## Setup

```tsx
import { Web3AppKitProvider, createConfig, injected } from '@web3-app-kit/react'
import { mainnet, base } from '@web3-app-kit/core/chains'

const config = createConfig({ chains: [mainnet, base], connectors: [injected()] })

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Web3AppKitProvider config={config} modal={{ inheritHostTheme: true }}>
      {children}
    </Web3AppKitProvider>
  )
}
```

Pass `modal={false}` to run headless and build your own UI on top of the hooks.

`inheritHostTheme` makes the modal read your shadcn theme variables off the
page, so it matches your app — including its light/dark switch — automatically.
Without it the modal uses shadcn's default neutral theme.

## Hooks

```tsx
const { address, chain, status, isConnected } = useAccount()
const { open, close, isOpen } = useAppKit()
open({ view: 'Receive' })   // address QR + copy button
const { data: balance } = useBalance({ refetchInterval: 12_000 })
const { switchChain, chains } = useSwitchChain()
const { signMessageAsync } = useSignMessage()
const { disconnect } = useDisconnect()

// Which wallet is on the other end, with its own logo
const { data: wallet } = useWalletInfo()   // { name: 'Core', icon, rdns }
const walletLogo = useWalletIcon()         // its own icon, or a bundled one

// Every EVM chain, searchable, with logos
const { results } = useChainSearch('zksync', { requireRpc: true })
const logoUrls = useChainIconUrls(8453)
const usdcLogo = useTokenIcon({ chainId: 1, address: '0xA0b8…eB48' })
const entry = useChainEntry(42161)
```

`useChainSearch` and friends lazily load `@web3-app-kit/chains`, so the
dataset is only downloaded by apps that use it. Add a chain the user picked
straight to the live config:

```tsx
config.addChain(toViemChain(entry))
await switchChainAsync({ chainId: entry.id })
```

Mutation hooks (`useConnect`, `useDisconnect`, `useSwitchChain`,
`useSignMessage`, `useSendTransaction`) all return the same shape:
`mutate`-style fire-and-forget, an `…Async` promise variant, plus `data`,
`error`, `isPending`, `isSuccess`, `isError` and `reset`. No query library
required.

## `<ConnectButton />`

```tsx
<ConnectButton showBalance showNetwork />
```

Styled to match shadcn/ui: it reads the host page's `--primary`, `--border`
and `--radius` when they exist, and falls back to shadcn's own light and dark
defaults otherwise. Pass `className` to restyle it, or bring your own markup
and keep the logic:

```tsx
<ConnectButton>
  {({ open, isConnected, displayName, balance }) => (
    <button onClick={() => open()}>{isConnected ? `${displayName} · ${balance}` : 'Connect'}</button>
  )}
</ConnectButton>
```

## SSR

State reads go through `useSyncExternalStore` with a stable server snapshot, and
the modal only mounts on the client. Pass `ssr: true` to `createConfig` to skip
discovery and auto-reconnect during server rendering.

MIT
