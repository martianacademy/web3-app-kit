import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadChainIcons,
  loadChainRegistry,
  loadTokenIcons,
  loadWalletIcons,
  type ChainEntry,
  type ChainIcons,
  type ChainQueryOptions,
  type ChainRegistry,
  type IconUrlOptions,
  type LoadChainIconsOptions,
  type TokenIconUrlOptions,
  type TokenIcons,
  type TokenQuery,
  type WalletIconQuery,
} from '@web3-app-kit/chains'

import { useAccount, useWalletInfo } from './useAccount.js'

/**
 * The chain logo table. Every dataset is dynamically imported, so the first
 * hook that mounts pays the download and later callers reuse it.
 *
 * Bundled logos are included by default — that is what makes the common chains
 * render sharply with no network at all. Pass `{ bundled: false }` to skip
 * that chunk and fall back to the CDN and IPFS URLs.
 */
export function useChainIcons(options: LoadChainIconsOptions = {}): {
  data: ChainIcons | undefined
  isLoading: boolean
} {
  const bundled = options.bundled
  const load = useCallback(() => loadChainIcons({ bundled }), [bundled])
  return useLazyResource(load)
}

/** HTTPS URL for a chain's logo. Defaults to the connected chain. */
export function useChainIcon(chainId?: number, options: IconUrlOptions = {}): string | undefined {
  return useChainIconUrls(chainId, options)[0]
}

/**
 * Every gateway URL worth trying for a chain's logo, best first. Public IPFS
 * gateways do not all pin every icon, so an `<img>` should advance through
 * this list on error instead of giving up after the first URL.
 */
export function useChainIconUrls(chainId?: number, options: IconUrlOptions = {}): string[] {
  const { chainId: connectedChainId } = useAccount()
  const id = chainId ?? (connectedChainId === undefined ? undefined : Number(connectedChainId))
  const { data } = useChainIcons()
  const { gateway } = options
  const gatewaysKey = options.gateways?.join(' ')

  return useMemo(() => {
    if (!data || id === undefined) return []
    return data.urls(id, {
      ...(gateway ? { gateway } : {}),
      ...(gatewaysKey ? { gateways: gatewaysKey.split(' ') } : {}),
    })
  }, [data, id, gateway, gatewaysKey])
}

/** The full chain registry: metadata, RPC endpoints and explorers for every EVM chain. */
export function useChainRegistry(): { data: ChainRegistry | undefined; isLoading: boolean } {
  return useLazyResource(loadChainRegistry)
}

export type UseChainSearchReturnType = {
  results: readonly ChainEntry[]
  isLoading: boolean
}

/**
 * Ranked search across every known chain — id, slug, name and native symbol.
 * Returns an empty list for an empty query rather than the whole registry.
 */
export function useChainSearch(
  query: string,
  options: ChainQueryOptions & { limit?: number } = {},
): UseChainSearchReturnType {
  const { data, isLoading } = useChainRegistry()
  const { includeTestnets, includeDeprecated, requireRpc, limit } = options

  const results = useMemo(() => {
    if (!data) return []
    return data.search(query, { includeTestnets, includeDeprecated, requireRpc, limit })
  }, [data, query, includeTestnets, includeDeprecated, requireRpc, limit])

  return { results, isLoading }
}

/** Metadata for a single chain id, e.g. to label a chain the wallet switched to. */
export function useChainEntry(chainId?: number): ChainEntry | undefined {
  const { chainId: connectedChainId } = useAccount()
  const id = chainId ?? (connectedChainId === undefined ? undefined : Number(connectedChainId))
  const { data } = useChainRegistry()
  return useMemo(() => (data && id !== undefined ? data.get(id) : undefined), [data, id])
}

/** The token icon index: address (or, failing that, ticker) to an SVG URL. */
export function useTokenIcons(): { data: TokenIcons | undefined; isLoading: boolean } {
  return useLazyResource(loadTokenIcons)
}

/**
 * URL for a token's logo. Pass `chainId` and `address` whenever you have them:
 * an address the index does not know resolves to `undefined` rather than
 * falling back to the ticker, because a token's `symbol()` is
 * attacker-controlled and a counterfeit would otherwise inherit a real logo.
 */
export function useTokenIcon(
  token: TokenQuery,
  options: TokenIconUrlOptions = {},
): string | undefined {
  const { data } = useTokenIcons()
  const { chainId, address, symbol } = token
  const { variant, baseUrl } = options

  return useMemo(() => {
    if (!data) return undefined
    return data.url({ chainId, address, symbol }, { variant, baseUrl })
  }, [data, chainId, address, symbol, variant, baseUrl])
}

/**
 * The connected wallet's logo. Prefers whatever the wallet itself announced
 * and falls back to a bundled one, which is what makes MetaMask, WalletConnect
 * and the flag-detected injected wallets show a real mark instead of a glyph.
 */
export function useWalletIcon(): string | undefined {
  const { data: info } = useWalletInfo()
  const { connector } = useAccount()
  const { data: icons } = useLazyResource(loadWalletIcons)

  return useMemo(() => {
    const own = info?.icon ?? connector?.icon
    if (own) return own
    if (!icons) return undefined
    const query: WalletIconQuery = {
      rdns: info?.rdns ?? connector?.rdns,
      connectorId: connector?.id,
      name: info?.name ?? connector?.name,
    }
    return icons.get(query)
  }, [info, connector, icons])
}

function useLazyResource<value>(load: () => Promise<value>): {
  data: value | undefined
  isLoading: boolean
} {
  const [data, setData] = useState<value | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    void load()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        // The dataset is optional enrichment; callers render without it.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => void (cancelled = true)
  }, [load])

  return { data, isLoading }
}
