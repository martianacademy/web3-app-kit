/**
 * CAIP-2 chain identifiers, the vocabulary this SDK uses to talk about chains
 * that are not all EVM. An id looks like `eip155:1`, `solana:5eykt4Us…` or
 * `bip122:000000000019d6689c085ae165831e93`.
 */

/** Ecosystems the SDK can connect to. */
export type ChainNamespace = 'eip155' | 'solana' | 'bip122'

export const CHAIN_NAMESPACES: readonly ChainNamespace[] = ['eip155', 'solana', 'bip122']

/** Human label for a namespace, for grouping wallets in a picker. */
export const NAMESPACE_LABELS: Record<ChainNamespace, string> = {
  eip155: 'Ethereum',
  solana: 'Solana',
  bip122: 'Bitcoin',
}

export type Caip2 = `${ChainNamespace}:${string}`

export function toCaip2(namespace: ChainNamespace, reference: string | number): Caip2 {
  return `${namespace}:${reference}` as Caip2
}

export function parseCaip2(
  value: string,
): { namespace: ChainNamespace; reference: string } | undefined {
  const index = value.indexOf(':')
  if (index <= 0) return undefined
  const namespace = value.slice(0, index) as ChainNamespace
  if (!CHAIN_NAMESPACES.includes(namespace)) return undefined
  const reference = value.slice(index + 1)
  return reference ? { namespace, reference } : undefined
}

export function isNamespace(value: unknown): value is ChainNamespace {
  return typeof value === 'string' && CHAIN_NAMESPACES.includes(value as ChainNamespace)
}

/**
 * A chain, described the same way whatever its ecosystem. EVM chains are also
 * viem `Chain` objects; the extra fields here are what the non-EVM connectors
 * need and what the modal renders.
 */
export type ChainDescriptor = {
  namespace: ChainNamespace
  /**
   * Reference within the namespace: the decimal chain id for `eip155`, and the
   * truncated genesis hash for `solana` and `bip122`, per CAIP-2.
   */
  reference: string
  caip2: Caip2
  name: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: readonly string[]
  blockExplorerUrl?: string
  testnet?: boolean
}

export function defineChain(
  chain: Omit<ChainDescriptor, 'caip2'> & { caip2?: Caip2 },
): ChainDescriptor {
  return { ...chain, caip2: chain.caip2 ?? toCaip2(chain.namespace, chain.reference) }
}

// ---------------------------------------------------------------------------
// Well-known non-EVM chains
//
// CAIP-2 truncates the genesis hash to 32 characters for both namespaces.

export const solanaMainnet = defineChain({
  namespace: 'solana',
  reference: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  name: 'Solana',
  nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
  rpcUrls: ['https://api.mainnet-beta.solana.com'],
  blockExplorerUrl: 'https://solscan.io',
})

export const solanaDevnet = defineChain({
  namespace: 'solana',
  reference: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  name: 'Solana Devnet',
  nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
  rpcUrls: ['https://api.devnet.solana.com'],
  blockExplorerUrl: 'https://solscan.io',
  testnet: true,
})

export const bitcoinMainnet = defineChain({
  namespace: 'bip122',
  reference: '000000000019d6689c085ae165831e93',
  name: 'Bitcoin',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 8 },
  rpcUrls: [],
  blockExplorerUrl: 'https://mempool.space',
})

export const bitcoinTestnet = defineChain({
  namespace: 'bip122',
  reference: '000000000933ea01ad0ee984209779ba',
  name: 'Bitcoin Testnet',
  nativeCurrency: { name: 'Test Bitcoin', symbol: 'tBTC', decimals: 8 },
  rpcUrls: [],
  blockExplorerUrl: 'https://mempool.space/testnet',
  testnet: true,
})

/** Wraps a viem chain so EVM and non-EVM chains can be handled uniformly. */
export function fromViemChain(chain: {
  id: number
  name: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: { default: { http: readonly string[] } }
  blockExplorers?: { default: { url: string } } | undefined
  testnet?: boolean | undefined
}): ChainDescriptor {
  return defineChain({
    namespace: 'eip155',
    reference: String(chain.id),
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: chain.rpcUrls.default.http,
    blockExplorerUrl: chain.blockExplorers?.default.url,
    testnet: chain.testnet,
  })
}
