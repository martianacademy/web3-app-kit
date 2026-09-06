import { defineChain, type Chain } from 'viem'

import type { ChainEntry } from './types.js'

/**
 * Converts a registry entry into a viem `Chain` that `createConfig` accepts.
 * Chains with no usable public RPC produce a chain with an empty URL list, so
 * pass your own transport for those.
 */
export function toViemChain(entry: ChainEntry): Chain {
  return defineChain({
    id: entry.id,
    name: entry.name,
    nativeCurrency: {
      name: entry.nativeCurrency.name || entry.nativeCurrency.symbol,
      symbol: entry.nativeCurrency.symbol,
      decimals: entry.nativeCurrency.decimals,
    },
    rpcUrls: {
      default: { http: [...entry.rpcUrls] },
    },
    blockExplorers: entry.blockExplorer
      ? {
          default: { name: entry.blockExplorer.name, url: entry.blockExplorer.url },
        }
      : undefined,
    testnet: entry.isTestnet || undefined,
  })
}

export function toViemChains(entries: readonly ChainEntry[]): Chain[] {
  return entries.map(toViemChain)
}
