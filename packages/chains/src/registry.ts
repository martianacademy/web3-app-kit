import type { ChainEntry, ChainQueryOptions } from './types.js'

type RegistryRow = [
  id: number,
  name: string,
  shortName: string,
  group: string,
  currencyName: string,
  currencySymbol: string,
  currencyDecimals: number,
  rpcUrls: string[],
  explorerUrl: string,
  explorerName: string,
  flags: number,
  parentChainId: number,
  infoUrl: string,
]

type RegistryPayload = {
  v: number
  generatedAt: string
  source: string
  chains: RegistryRow[]
}

const FLAG_TESTNET = 1
const FLAG_DEPRECATED = 2

export type ChainRegistry = {
  /** Number of chains in the dataset. */
  readonly size: number
  /** The date the dataset was generated, `YYYY-MM-DD`. */
  readonly generatedAt: string
  get(chainId: number): ChainEntry | undefined
  /** Lookup by Chainlist slug, e.g. `eth`, `base`, `arb1`. Case-insensitive. */
  getByShortName(shortName: string): ChainEntry | undefined
  /** Ranked search over id, slug and name. */
  search(query: string, options?: ChainQueryOptions & { limit?: number }): ChainEntry[]
  all(options?: ChainQueryOptions): ChainEntry[]
}

let registryPromise: Promise<ChainRegistry> | undefined

/**
 * Loads the full chain dataset. The data lives in a dynamically imported
 * module, so bundlers split it into its own chunk and an app that never calls
 * this never downloads it. Repeat calls reuse the same parsed instance.
 */
export function loadChainRegistry(): Promise<ChainRegistry> {
  registryPromise ??= import('./data/registry.js').then(({ REGISTRY_JSON }) =>
    buildRegistry(JSON.parse(REGISTRY_JSON) as RegistryPayload),
  )
  return registryPromise
}

function buildRegistry(payload: RegistryPayload): ChainRegistry {
  const entries = payload.chains.map(toEntry)
  const byId = new Map<number, ChainEntry>()
  const byShortName = new Map<string, ChainEntry>()
  for (const entry of entries) {
    byId.set(entry.id, entry)
    if (entry.shortName) byShortName.set(entry.shortName.toLowerCase(), entry)
  }

  const passes = (entry: ChainEntry, options?: ChainQueryOptions) => {
    if (!options?.includeTestnets && entry.isTestnet) return false
    if (!options?.includeDeprecated && entry.isDeprecated) return false
    if (options?.requireRpc && entry.rpcUrls.length === 0) return false
    return true
  }

  return {
    size: entries.length,
    generatedAt: payload.generatedAt,
    get: (chainId) => byId.get(chainId),
    getByShortName: (shortName) => byShortName.get(shortName.trim().toLowerCase()),
    all: (options) => entries.filter((entry) => passes(entry, options)),
    search(query, options) {
      const needle = query.trim().toLowerCase()
      if (!needle) return []
      const limit = options?.limit ?? 25

      const scored: Array<{ entry: ChainEntry; score: number }> = []
      for (const entry of entries) {
        if (!passes(entry, options)) continue
        const score = scoreMatch(entry, needle)
        if (score > 0) scored.push({ entry, score })
      }

      return scored
        .sort((a, b) => b.score - a.score || a.entry.id - b.entry.id)
        .slice(0, limit)
        .map((item) => item.entry)
    },
  }
}

/** Higher is better; `0` means no match. */
function scoreMatch(entry: ChainEntry, needle: string): number {
  if (String(entry.id) === needle) return 1000
  const shortName = entry.shortName.toLowerCase()
  if (shortName === needle) return 900
  const name = entry.name.toLowerCase()
  if (name === needle) return 850
  if (name.startsWith(needle)) return 700
  if (shortName.startsWith(needle)) return 650
  if (entry.nativeCurrency.symbol.toLowerCase() === needle) return 600
  if (name.includes(needle)) return 400
  if (String(entry.id).startsWith(needle)) return 200
  return 0
}

function toEntry(row: RegistryRow): ChainEntry {
  const entry: ChainEntry = {
    id: row[0],
    name: row[1],
    shortName: row[2],
    group: row[3],
    nativeCurrency: {
      name: row[4] || row[5],
      symbol: row[5],
      decimals: row[6],
    },
    rpcUrls: row[7],
    isTestnet: (row[10] & FLAG_TESTNET) !== 0,
    isDeprecated: (row[10] & FLAG_DEPRECATED) !== 0,
  }
  if (row[8]) entry.blockExplorer = { name: row[9] || 'Explorer', url: row[8] }
  if (row[11]) entry.parentChainId = row[11]
  if (row[12]) entry.infoUrl = row[12]
  return entry
}
