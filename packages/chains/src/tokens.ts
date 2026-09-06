import type { Address } from 'viem'

type TokenIconsPayload = {
  v: number
  generatedAt: string
  /** Commit the icons are pinned to. */
  ref: string
  tokens: Array<[id: string, symbol: string]>
  /** `[chainId, address without 0x, tokenIndex]`, sorted by chain then address. */
  byAddress: Array<[chainId: number, address: string, index: number]>
  bySymbol: Array<[symbol: string, index: number]>
}

export type TokenIcon = {
  /** File name in the icon set, e.g. `USDC`. */
  id: string
  symbol: string
}

export type TokenIconVariant = 'branded' | 'mono' | 'background'

export type TokenIconUrlOptions = {
  /** `branded` (default) is the full-colour mark. */
  variant?: TokenIconVariant
  /** Serve the SVGs from your own mirror instead of the default CDN. */
  baseUrl?: string
}

export type TokenQuery = {
  chainId?: number
  address?: Address | string
  /** Only used when the address is unknown or unmatched. */
  symbol?: string
}

export type TokenIcons = {
  /** Number of tokens in the index. */
  readonly size: number
  readonly generatedAt: string
  /**
   * Resolves a token to its icon.
   *
   * When `chainId` and `address` are given, the address decides: an address
   * the index does not know resolves to `undefined` **even if `symbol`
   * matches**. A token contract's `symbol()` is attacker-controlled, so
   * falling through would put USDC's mark on a counterfeit. Pass `symbol`
   * alone only for tokens you genuinely know by ticker and nothing else.
   */
  get(token: TokenQuery): TokenIcon | undefined
  url(token: TokenQuery, options?: TokenIconUrlOptions): string | undefined
}

/**
 * Where the token SVGs are served from. jsDelivr mirrors the MIT-licensed
 * web3icons repository, pinned to a commit, so the URLs are immutable and
 * there is no hosting to run — bundling 1,800 icons would dwarf every other
 * dataset in this package.
 */
export const DEFAULT_TOKEN_ICON_CDN =
  'https://cdn.jsdelivr.net/gh/0xa3k5/web3icons@REF/packages/core/src/svgs/tokens'

let tokensPromise: Promise<TokenIcons> | undefined

export function loadTokenIcons(): Promise<TokenIcons> {
  tokensPromise ??= import('./data/token-icons.js').then(({ TOKEN_ICONS_JSON }) =>
    buildTokenIcons(JSON.parse(TOKEN_ICONS_JSON) as TokenIconsPayload),
  )
  return tokensPromise
}

function buildTokenIcons(payload: TokenIconsPayload): TokenIcons {
  const byAddress = new Map<string, number>()
  for (const [chainId, address, index] of payload.byAddress)
    byAddress.set(`${chainId}:${address}`, index)

  const bySymbol = new Map<string, number>()
  for (const [symbol, index] of payload.bySymbol)
    // First entry wins: the metadata is ordered by market cap rank, so the
    // best-known token keeps an ambiguous ticker.
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, index)

  const baseUrl = DEFAULT_TOKEN_ICON_CDN.replace('REF', payload.ref)

  const lookup = (token: TokenQuery): TokenIcon | undefined => {
    if (token.chainId && token.address) {
      const key = `${token.chainId}:${token.address.toLowerCase().replace(/^0x/, '')}`
      const index = byAddress.get(key)
      // Deliberately no symbol fallback here: an unknown address means an
      // unknown token, whatever it calls itself.
      return index === undefined ? undefined : toIcon(payload, index)
    }
    if (token.symbol) {
      const index = bySymbol.get(token.symbol.toUpperCase())
      if (index !== undefined) return toIcon(payload, index)
    }
    return undefined
  }

  return {
    size: payload.tokens.length,
    generatedAt: payload.generatedAt,
    get: lookup,
    url(token, options) {
      const icon = lookup(token)
      if (!icon) return undefined
      return tokenIconUrl(icon, { ...options, baseUrl: options?.baseUrl ?? baseUrl })
    },
  }
}

/** Builds the SVG URL for an icon resolved by {@link TokenIcons.get}. */
export function tokenIconUrl(
  icon: TokenIcon | undefined,
  options: TokenIconUrlOptions = {},
): string | undefined {
  if (!icon?.id) return undefined
  const base = (options.baseUrl ?? DEFAULT_TOKEN_ICON_CDN).replace(/\/+$/, '')
  return `${base}/${options.variant ?? 'branded'}/${encodeURIComponent(icon.id)}.svg`
}

function toIcon(payload: TokenIconsPayload, index: number): TokenIcon | undefined {
  const entry = payload.tokens[index]
  // Upstream casing is inconsistent ("usdc", "USDC", "WETH"); tickers are
  // uppercase by convention and callers render this directly.
  return entry ? { id: entry[0], symbol: entry[1].toUpperCase() } : undefined
}
