# @web3-app-kit/swap

> The modal no longer renders a swap UI of its own — DODO's widget replaced it,
> see `@web3-app-kit/swap-widget`. This package is still the MIT route for
> building your own swap UI or swapping headlessly.

Multichain token swaps, routed through [DODO](https://docs.dodoex.io)'s
SmartTrade API. Quote, approve and execute — everything configurable, fee
included.

```bash
npm install @web3-app-kit/swap viem
```

## Usage

```ts
import { getSwapQuote, needsApproval, approveSwap, executeSwap } from '@web3-app-kit/swap'

const swapConfig = {
  apiKey: process.env.DODO_API_KEY!,
  feeRecipient: '0xYourTreasury',  // your cut goes here
  fee: 10,                         // DODO's `fee` parameter, verbatim
  slippage: 1,
}

const quote = await getSwapQuote(config, swapConfig, {
  chainId: 1,
  fromToken: { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', decimals: 18 },
  toToken: { address: '0xA0b8…eB48', symbol: 'USDC', decimals: 6 },
  fromAmount: 10n ** 17n,
  account,
})

if (await needsApproval(config, quote)) await approveSwap(config, quote)
const hash = await executeSwap(config, quote)
```

## Configuration

| Option | Meaning |
| --- | --- |
| `apiKey` | **Required.** DODO rejects requests without one. |
| `feeRecipient` | Where your cut of each swap is sent (DODO's `rebateTo`). |
| `fee` | Your cut, passed through as DODO's `fee`. Whole numbers only — see below. |
| `slippage` | Tolerance in percent. Default `1`. |
| `deadlineMinutes` | How long a quote stays valid. Default `10`. |
| `source` | `dodoV2AndMixWasm` (full router) or `noMaxHops` (direct pairs, cheaper gas). |
| `estimateGas` | Simulate for a gas estimate. Defaults to `true` for native input, `false` for ERC-20 — see below. |
| `baseUrl` | Override the endpoint — see *Proxying* below. |
| `chainIds` | Chains the UI offers. Defaults to every EVM chain in the config. |

**The fee needs both halves.** DODO ignores `rebateTo` without `fee` and vice
versa, so this package sends neither unless both are set — sending one alone
would quietly produce a fee-free swap while the dApp believed it was earning.
There is a test for exactly that.

**The fee is an integer.** DODO's `fee` is a uint and answers `0.3` with
`the value "0.3" cannot parsed as uint`, so it is validated before the request
goes out rather than failing at the API.

**The denomination is undocumented.** The number you pass is embedded verbatim
in the swap calldata — sending `10` puts `0x0a` in the transaction, `1000` puts
`0x3e8` — but DODO states nowhere what it is denominated in: not in their API
docs, and not in `@dodoex/widgets`' `feeRate` type, which is just `number`. It
cannot be inferred from the quote either: the response is byte-identical
whether you send `10`, `1000` or no fee at all, because the router takes the
fee at execution. **Confirm it with DODO or one small real trade before relying
on it** — basis points versus percent is 100x of someone's money.

**Quotes are pre-fee.** For the same reason, `toAmount` is what DODO would
return with no fee. When `hasConfiguredFee` is true the wallet receives less
than that, so do not present it as a guaranteed amount.

## Gas simulation

`estimateGas=true` asks DODO to simulate the swap. For an ERC-20 input that
simulation reverts with `SafeERC20: low-level call failed` until the allowance
exists — which would make it impossible to quote the very swap the user is
about to approve. So it defaults to `true` only for native input, and `false`
for ERC-20. Set it explicitly to override.

## In the modal

```ts
createModal({
  config,
  swap: { apiKey, tokens: { 1: [...], 8453: [...] }, feeRecipient, feeRate },
})
```

A **Swap** entry then appears in the account view, and only there: the view
needs a wallet, so `open({ view: 'Swap' })` while disconnected falls back to
the wallet list rather than rendering a dead end. Omit the `swap` option and
nothing about swapping appears at all.

`tokens` has no default on purpose. Which tokens a dApp is willing to route is
a trust decision, and an unvetted list is how users get handed lookalike
contracts.

### Multichain

The swap view has its own network row. Picking a chain switches the wallet and
reloads that chain's token list, because a route is always within one chain —
DODO rejects a pair whose tokens live on different chains, so there is nothing
to gain from letting the two sides drift apart.

Restrict the chains offered with `chainIds`; on a chain outside the list, the
view says so rather than offering tokens it cannot route.

### Token picker

Tokens are chosen from a searchable list — symbol, name or a pasted address —
with logos resolved by contract address through `@web3-app-kit/chains`. The
token already selected on the other side is disabled, since a token cannot be
swapped for itself.

## Approvals

The allowance goes to `quote.spender`, **not** to `quote.transaction.to`. On a
live USDC route those are different addresses — DODO returns a separate
`targetApproveAddr` — so approving the transaction target would leave the swap
reverting. Native coins report an unlimited allowance, so callers do not need
to special-case them.

## Proxying

`getdodoroute` is called straight from the browser and DODO returns CORS
headers for it, so no proxy is needed to make it work. Point `baseUrl` at your
own endpoint if you would rather keep the API key off the client, or if your
key is origin-restricted.

## Or use DODO's widget

DODO ships a drop-in React widget, and it accepts an EIP-1193 `provider`, so it
can reuse the wallet this SDK connected rather than running its own connect
flow. [`@web3-app-kit/swap-widget`](../swap-widget) wires that up.

It is a separate package because it is **GPL-3.0-or-later**: making it a
dependency of an MIT library would push copyleft onto every dApp that embeds
the SDK. It also weighs 4.1 MB unpacked across 44 dependencies, and being React
it cannot mount inside this modal's shadow root — it is its own surface.

It does not resolve the fee denomination question either: it calls the same
endpoint with the same undocumented `feeRate`.

MIT
