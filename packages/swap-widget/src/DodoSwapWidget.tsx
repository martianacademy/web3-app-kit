import { createElement, useMemo, type ComponentType, type ReactElement } from 'react'
import type { Config } from '@web3-app-kit/core'

import { useConnectedProvider } from './useConnectedProvider.js'

/** The shape of `SwapWidget` from `@dodoex/widgets`. */
export type DodoWidgetComponent = ComponentType<Record<string, unknown>>

/** A token entry in `@dodoex/widgets`' `tokenList`. */
export type DodoTokenInfo = {
  chainId: number
  address: string
  name: string
  decimals: number
  symbol: string
  logoURI?: string
}

export type DodoSwapWidgetProps = {
  config: Config
  /**
   * `SwapWidget` from `@dodoex/widgets`, imported by you.
   *
   * Use `SwapWidget`, not `Widget`. `Widget` is only the shell — theme, context
   * and the toast layer — and renders no swap UI on its own.
   *
   * It is passed in rather than imported here on purpose. `@dodoex/widgets` is
   * GPL-3.0-or-later, and a frontend ships its JavaScript to every visitor, so
   * taking it on is a licensing decision for the application. Requiring the
   * import at your own call site keeps that decision visible, and keeps this
   * package free of the dependency.
   */
  widget: DodoWidgetComponent
  /** DODO API key. */
  apikey: string
  /**
   * Fee recipient and rate, handed to the widget unchanged.
   *
   * The same caveat applies as in `@web3-app-kit/swap`: DODO does not document
   * what `feeRate` is denominated in, and the widget calls the same endpoint,
   * so this route does not answer that question either.
   */
  rebateTo?: string
  feeRate?: number
  /**
   * Which tokens the widget offers.
   *
   * Leave it unset to get DODO's own list, which already spans ten chains —
   * that is usually what you want from their widget. Set it only to restrict
   * the widget to your own vetted tokens; the chain strip in the token picker
   * is built from the chain ids present here, so a single-chain list turns
   * cross-chain off in practice however `crossChain` is set.
   */
  tokenList?: 'all' | readonly DodoTokenInfo[]
  /**
   * Tokens shown in the picker's "popular" section, same shape as `tokenList`.
   *
   * Worth setting alongside a long list: it is DODO's own way of surfacing the
   * handful of tokens most people actually want, rather than making them
   * scroll or search for them.
   */
  popularTokenList?: readonly DodoTokenInfo[]
  /**
   * RPC endpoints per chain id, used for the widget's own reads.
   *
   * Left unset, this is filled in from the chains on your `config`, so the
   * widget reads through the same endpoints as the rest of the SDK instead of
   * the public nodes it otherwise falls back to. Pass your own to override.
   */
  jsonRpcUrlMap?: Record<number, readonly string[]>
  /**
   * Cross-chain swaps. DODO's widget defaults this to `false`, and the chain
   * strip in the token picker is empty until it is on. The strip is icon-only,
   * so the currently selected chain is the only one that renders as text.
   */
  crossChain?: boolean
  /** Restrict the widget to these chain ids. Defaults to everything DODO supports. */
  supportChainIds?: number[]
  /**
   * The pair the widget opens on. Worth setting alongside a large `tokenList`:
   * left unset, the widget takes the first entries of that list, which is how
   * you end up opening on a token nobody asked for.
   */
  defaultFromToken?: DodoTokenInfo
  defaultToToken?: DodoTokenInfo
  defaultChainId?: number
  width?: string | number
  height?: string | number
  colorMode?: 'light' | 'dark'
  /** MUI theme overrides. `theme.palette.mode` must match `colorMode` to apply. */
  theme?: Record<string, unknown>
  /**
   * Supplies a logo for a token the widget would otherwise draw as a
   * placeholder. Return `params.url` to accept what it already had.
   *
   * Native coins need this: token lists cover contracts, so ETH, BNB and AVAX
   * arrive with no `logoURI` of their own.
   */
  getTokenLogoUrl?: (params: {
    address?: string
    chainId?: number
    url?: string
    width?: number
    height?: number
  }) => string | undefined
  /**
   * Slippage tolerance in percent — `1` is 1%. `swapSlippage` covers same-chain
   * trades, `bridgeSlippage` cross-chain ones; `null` restores DODO's
   * automatic setting. Both appear in DODO's own documented integration.
   */
  swapSlippage?: number | null
  bridgeSlippage?: number | null
  /** Rendered while no wallet is connected. Defaults to nothing. */
  fallback?: ReactElement | null
  /** Anything else `@dodoex/widgets` accepts. */
  widgetProps?: Record<string, unknown>
}

/**
 * DODO's swap widget, driven by this SDK's wallet connection.
 *
 * The widget accepts an EIP-1193 `provider`, so it reuses the wallet already
 * connected here instead of running a second connect flow of its own.
 */
export function DodoSwapWidget({
  config,
  widget,
  fallback = null,
  widgetProps,
  jsonRpcUrlMap,
  ...props
}: DodoSwapWidgetProps): ReactElement | null {
  const provider = useConnectedProvider(config)
  const rpcUrls = useMemo(() => jsonRpcUrlMap ?? rpcUrlMapFrom(config), [jsonRpcUrlMap, config])
  if (!provider) return fallback

  return createElement(widget, {
    ...props,
    jsonRpcUrlMap: rpcUrls,
    ...widgetProps,
    provider,
  })
}

/** The HTTP endpoints declared on the config's chains, keyed by chain id. */
function rpcUrlMapFrom(config: Config): Record<number, string[]> {
  const map: Record<number, string[]> = {}
  for (const chain of config.chains) {
    const urls = chain.rpcUrls?.default?.http
    if (urls?.length) map[chain.id] = [...urls]
  }
  return map
}
