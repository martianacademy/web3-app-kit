/** An IPFS-hosted logo, as published by ethereum-lists/chains. */
export type ChainIpfsIcon = {
  cid: string
  /** `png`, `svg`, `jpg`, … */
  format: string
}

/**
 * A chain logo. Most chains have an IPFS image from ethereum-lists; several of
 * the largest (Arbitrum One, OP Mainnet, BNB Smart Chain, …) do not, and are
 * covered by a CDN slug instead. Either field may be absent.
 */
export type ChainIcon = {
  /**
   * A `data:` URI shipped inside the package — no network, no hosting, and a
   * known resolution. Present for the chains most dApps use.
   */
  bundled?: string
  ipfs?: ChainIpfsIcon
  /** Slug on the icon CDN. See `chainIconUrls` for how it becomes a URL. */
  cdn?: string
}

export type ChainBlockExplorer = {
  name: string
  url: string
}

/** One EVM network, as published by ethereum-lists/chains. */
export type ChainEntry = {
  id: number
  name: string
  /** Chainlist-style slug, e.g. `eth`, `base`, `arb1`. */
  shortName: string
  /** Family the chain belongs to, e.g. `ETH`, `MATIC`. Useful for grouping. */
  group: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  /** Public HTTPS endpoints only — templated and websocket URLs are filtered out. */
  rpcUrls: readonly string[]
  blockExplorer?: ChainBlockExplorer
  isTestnet: boolean
  /** Upstream marked this chain as no longer operating. */
  isDeprecated: boolean
  /** Set on rollups and sidechains that declare a settlement layer. */
  parentChainId?: number
  infoUrl?: string
}

export type ChainQueryOptions = {
  /** Testnets are excluded by default. */
  includeTestnets?: boolean
  /** Deprecated chains are excluded by default. */
  includeDeprecated?: boolean
  /** Only chains that have at least one usable RPC endpoint. */
  requireRpc?: boolean
}
