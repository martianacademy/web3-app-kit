import { useEffect, useState } from 'react'

import type { DodoTokenInfo } from './DodoSwapWidget.js'

/**
 * CoinGecko's platform slugs for the chains DODO supports.
 *
 * DODO's widget never fetches a token list of its own — `useInitTokenList`
 * falls back to a small bundled constant unless you hand it an array — and
 * DODO's own app fills that gap from CoinGecko, which is what the widget's
 * `getCGTokenListAPI` refers to. This is the same source.
 */
export const COINGECKO_PLATFORMS: Readonly<Record<number, string>> = {
  1: 'ethereum',
  10: 'optimistic-ethereum',
  56: 'binance-smart-chain',
  137: 'polygon-pos',
  324: 'zksync',
  1030: 'conflux',
  5000: 'mantle',
  8453: 'base',
  42161: 'arbitrum-one',
  43114: 'avalanche',
  59144: 'linea',
  534352: 'scroll',
  1313161554: 'aurora',
}

/** The address DODO (and most routers) use to mean a chain's native coin. */
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

/**
 * Native coins, keyed by chain id.
 *
 * CoinGecko's lists cover contracts only, so without these the widget cannot
 * offer ETH, BNB or AVAX at all — you would be able to swap every token on a
 * chain except the one people actually hold.
 */
const NATIVE_TOKENS: Readonly<Record<number, { symbol: string; name: string; decimals: number }>> =
  {
    1: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    10: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    56: { symbol: 'BNB', name: 'BNB', decimals: 18 },
    137: { symbol: 'POL', name: 'Polygon Ecosystem Token', decimals: 18 },
    324: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    1030: { symbol: 'CFX', name: 'Conflux', decimals: 18 },
    5000: { symbol: 'MNT', name: 'Mantle', decimals: 18 },
    8453: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    42161: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    43114: { symbol: 'AVAX', name: 'Avalanche', decimals: 18 },
    59144: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    534352: { symbol: 'ETH', name: 'Ether', decimals: 18 },
    1313161554: { symbol: 'ETH', name: 'Ether', decimals: 18 },
  }

/** A token to hoist to the top of the list, identified by address. */
export type PinnedToken = { chainId: number; address: string }

/**
 * Extra token lists in the standard `{ tokens: [...] }` format, merged on top
 * of the per-chain CoinGecko ones.
 *
 * These are the public lists DODO's own app offers in its "Manage Token Lists"
 * panel. Their own default, "DODO Tokenlist Labs", comes from their backend
 * and has no public URL, so it cannot be reused here. CoinMarketCap's list is
 * left out because it does not send CORS headers and fails in the browser.
 */
export const TOKEN_LIST_SOURCES: readonly string[] = [
  // Broad BSC coverage, which the CoinGecko chain lists are thin on.
  'https://tokens.pancakeswap.finance/pancakeswap-extended.json',
  // Optimism, Base and the rest of the Superchain.
  'https://static.optimism.io/optimism.tokenlist.json',
]

export type TokenListOptions = {
  /** Defaults to every chain in `COINGECKO_PLATFORMS`. */
  chainIds?: readonly number[]
  /**
   * Tokens to place directly after the native coins.
   *
   * The widget ignores `defaultToToken` once `crossChain` is on and takes its
   * opening pair from the head of this list instead, so without a few pinned
   * majors it opens on whichever token sorts first — on a permissionless list
   * that is a joke ticker, not USDC. Matching is by address, never by symbol,
   * because a symbol is whatever its deployer decided to call it.
   */
  pinned?: readonly PinnedToken[]
  /** Defaults to `TOKEN_LIST_SOURCES`. Pass `[]` for CoinGecko only. */
  sources?: readonly string[]
  /**
   * Most tokens kept per chain, after natives and `pinned`. Defaults to 150.
   *
   * This is not cosmetic. The widget opens one react-query query per token in
   * the list to read its balance, so an uncapped CoinGecko chain — Ethereum
   * alone is ~5,900 tokens — fires thousands of queries and locks the page up.
   * DODO's own app stays responsive because its default list is about 1,200
   * tokens across every chain.
   *
   * Anything cut is still reachable: pasting an address the list does not
   * contain makes the picker look that one token up on its own.
   */
  limitPerChain?: number
  signal?: AbortSignal
}

type RawList = { tokens?: unknown }

function isTokenInfo(value: unknown, chainId: number): value is DodoTokenInfo {
  if (typeof value !== 'object' || value === null) return false
  const token = value as Record<string, unknown>
  return (
    token.chainId === chainId &&
    typeof token.address === 'string' &&
    typeof token.symbol === 'string' &&
    typeof token.name === 'string' &&
    typeof token.decimals === 'number'
  )
}

/**
 * Every token CoinGecko lists for the given chains, flattened into the shape
 * `@dodoex/widgets` wants for its `tokenList` prop.
 *
 * A chain whose list fails to load is skipped rather than failing the whole
 * call, so one bad response does not leave the widget with no tokens at all.
 *
 * This is a broad, permissionless list: appearing on it is not a safety
 * signal. Pass your own vetted array instead if that matters for your dApp.
 */
export async function fetchTokenList({
  chainIds,
  pinned,
  sources = TOKEN_LIST_SOURCES,
  limitPerChain = 150,
  signal,
}: TokenListOptions = {}): Promise<DodoTokenInfo[]> {
  const ids = chainIds ?? Object.keys(COINGECKO_PLATFORMS).map(Number)
  const wanted = new Set(ids)

  // Retried once: a failure here is silent (every list is settled
  // independently so one bad response cannot empty the picker), and a chain
  // that quietly loses its tokens to a blip looks like an unsupported chain.
  const readList = async (url: string, attempt = 0): Promise<unknown[]> => {
    try {
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`${url} returned ${response.status}`)
      const body = (await response.json()) as RawList
      return Array.isArray(body.tokens) ? body.tokens : []
    } catch (error) {
      if (attempt > 0 || signal?.aborted) throw error
      await new Promise((resolve) => setTimeout(resolve, 400))
      return readList(url, attempt + 1)
    }
  }

  const results = await Promise.allSettled([
    ...ids.map(async (chainId) => {
      const platform = COINGECKO_PLATFORMS[chainId]
      if (!platform) return []
      const tokens = await readList(`https://tokens.coingecko.com/${platform}/all.json`)
      return tokens.filter((token): token is DodoTokenInfo => isTokenInfo(token, chainId))
    }),
    ...sources.map(async (url) => {
      const tokens = await readList(url)
      return tokens.filter(
        (token): token is DodoTokenInfo =>
          typeof token === 'object' &&
          token !== null &&
          wanted.has((token as { chainId?: unknown }).chainId as number) &&
          isTokenInfo(token, (token as { chainId: number }).chainId),
      )
    }),
  ])

  // Deduplicated by address, first list wins. Two lists naming the same
  // contract is normal; two entries for one contract in the picker is not.
  const seen = new Set<string>()
  const fetched: DodoTokenInfo[] = []
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const token of result.value) {
      const key = `${token.chainId}-${token.address.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      fetched.push(token)
    }
  }

  // Natives first: the widget picks its default pay/receive tokens off the head
  // of this array, and a list that opens on an obscure ERC-20 reads as broken.
  const natives = ids.flatMap((chainId) => {
    const native = NATIVE_TOKENS[chainId]
    if (!native || !COINGECKO_PLATFORMS[chainId]) return []
    return [{ chainId, address: NATIVE_TOKEN_ADDRESS, ...native }]
  })

  // Ordered by the chain order you asked for, then alphabetically like DODO's
  // own picker. Order is not cosmetic here: with `crossChain` on, the widget
  // stops constraining its default pair to the current chain (`crossChain ?
  // undefined : chainId` in its own source) and just takes the head of this
  // array, so an unordered list opens the widget on a random token on a random
  // chain.
  const rank = new Map(ids.map((chainId, index) => [chainId, index]))
  fetched.sort(
    (a, b) =>
      (rank.get(a.chainId) ?? ids.length) - (rank.get(b.chainId) ?? ids.length) ||
      a.symbol.localeCompare(b.symbol),
  )

  const pinnedKeys = new Set(
    (pinned ?? []).map((token) => `${token.chainId}-${token.address.toLowerCase()}`),
  )
  const hoisted: DodoTokenInfo[] = []
  const rest: DodoTokenInfo[] = []
  for (const token of fetched) {
    if (pinnedKeys.has(`${token.chainId}-${token.address.toLowerCase()}`)) hoisted.push(token)
    else rest.push(token)
  }

  const ordered = [...natives, ...hoisted, ...rest]
  if (!Number.isFinite(limitPerChain)) return ordered

  const kept = new Map<number, number>()
  return ordered.filter((token) => {
    const count = kept.get(token.chainId) ?? 0
    if (count >= limitPerChain) return false
    kept.set(token.chainId, count + 1)
    return true
  })
}

export type TokenListState = {
  tokens: DodoTokenInfo[] | undefined
  isLoading: boolean
  error: Error | undefined
}

/** `fetchTokenList` as a hook, for passing straight to `tokenList`. */
export function useTokenList(
  chainIds?: readonly number[],
  pinned?: readonly PinnedToken[],
  limitPerChain?: number,
): TokenListState {
  const [state, setState] = useState<TokenListState>({
    tokens: undefined,
    isLoading: true,
    error: undefined,
  })

  // Serialised so a fresh array literal from the caller does not refetch. An
  // empty array is a real answer — "no chains" — and must not read as "unset",
  // or asking for nothing would fetch every list.
  const skip = chainIds?.length === 0
  const key = chainIds ? chainIds.join(',') : ''
  const pinnedKey = pinned ? pinned.map((t) => `${t.chainId}-${t.address}`).join(',') : ''

  useEffect(() => {
    if (skip) {
      setState({ tokens: [], isLoading: false, error: undefined })
      return
    }
    const controller = new AbortController()
    setState({ tokens: undefined, isLoading: true, error: undefined })

    fetchTokenList({
      chainIds: key ? key.split(',').map(Number) : undefined,
      pinned: pinnedKey
        ? pinnedKey.split(',').map((entry) => {
            const [chainId, address] = entry.split('-')
            return { chainId: Number(chainId), address: address ?? '' }
          })
        : undefined,
      ...(limitPerChain === undefined ? {} : { limitPerChain }),
      signal: controller.signal,
    })
      .then((tokens) => setState({ tokens, isLoading: false, error: undefined }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          tokens: undefined,
          isLoading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      })

    return () => controller.abort()
  }, [key, pinnedKey, limitPerChain, skip])

  return state
}
