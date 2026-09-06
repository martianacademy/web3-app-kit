# @web3-app-kit/swap-widget

DODO's own swap widget, driven by a web3-app-kit connection.

> **This package is GPL-3.0-or-later**, unlike the rest of web3-app-kit, which
> is MIT. It is published separately so the MIT packages stay MIT and taking on
> copyleft is something you opt into knowingly.

```bash
npm install @web3-app-kit/swap-widget @dodoex/widgets
```

```tsx
import { SwapWidget } from '@dodoex/widgets'
import { DodoSwapWidget } from '@web3-app-kit/swap-widget'

<DodoSwapWidget
  config={config}
  widget={SwapWidget}
  apikey={import.meta.env.VITE_DODO_API_KEY}
  rebateTo="0xYourTreasury"
  feeRate={10}
  fallback={<p>Connect a wallet to swap.</p>}
/>
```

Use `SwapWidget`, not `Widget`: `Widget` is only the shell — theme, context and
the toast layer — and on its own renders no swap UI at all.

The component is passed in rather than imported here. `@dodoex/widgets` is a peer
dependency this package never installs: a frontend ships its JavaScript to
every visitor, so pulling in GPL code is a decision for the application, and
requiring the import at your own call site keeps that decision visible. (Not
legal advice — if the licence matters commercially, check it with counsel.)

## What it does and does not solve

It reuses the wallet you already connected: the widget takes an EIP-1193
`provider`, and `useConnectedProvider` feeds it the one behind the current EVM
connection, so there is no second connect flow.

It does **not** answer the fee question. The widget passes `feeRate` to the same
`getdodoroute` endpoint as `@web3-app-kit/swap`, with the same undocumented
denomination — so switching here does not tell you whether `10` means 0.10%.

## Widget or API?

| | `@web3-app-kit/swap` | this package |
| --- | --- | --- |
| Licence | MIT | **GPL-3.0-or-later** |
| Weight | ~6 KB | ~4.1 MB unpacked, 44 dependencies |
| UI | inside the SDK modal, themed with it | its own React surface, its own styling |
| Works without React | yes | no |
| Maintained by | this project | DODO |

Use the widget when you want DODO's full trading UI — order history, its own
token lists and settings — and the licence is acceptable. Use the API package
when you want swapping inside the SDK's modal, an MIT dependency tree, or no
React at all.

## Token lists

DODO's widget never fetches a token list. `useInitTokenList` uses the array you
pass as `tokenList`, and otherwise falls back to a small bundled constant — a
handful of tokens per chain. DODO's own app fills the gap from the standard
token lists in its "Manage Token Lists" panel; `useTokenList` does the same:

```tsx
const { tokens, isLoading, error } = useTokenList(undefined, pinned)
<DodoSwapWidget config={config} widget={SwapWidget} apikey={key} crossChain tokenList={tokens} />
```

It merges CoinGecko's per-chain lists with PancakeSwap's and Optimism's,
deduplicates by address, and prepends each chain's native coin — CoinGecko
lists contracts only, so without that you can swap every token on a chain
except the one people actually hold.

Order matters more than it looks. With `crossChain` on, the widget stops
constraining its default pair to the current chain and takes the head of the
array, so `defaultToToken` is ignored and an unordered list opens the widget on
whatever ticker sorts first. Pass `pinned` (matched by address, never by
symbol) to hoist the majors you trust.

These are broad, permissionless lists: being on one is not a safety signal.
Pass your own vetted array as `tokenList` if that matters for your dApp.

## Licence

GPL-3.0-or-later, matching `@dodoex/widgets`.
