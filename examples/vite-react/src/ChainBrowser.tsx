import { useMemo, useState } from 'react'
import {
  toViemChain,
  useAccount,
  useChainSearch,
  useConfig,
  useSwitchChain,
  type ChainEntry,
} from '@web3-app-kit/react'

import { ChainLogo } from './ChainLogo.js'

/**
 * Search every EVM chain in the registry, then add the one you picked to the
 * live config and switch the wallet to it.
 */
export function ChainBrowser() {
  const config = useConfig()
  const { isConnected, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const [query, setQuery] = useState('')
  const [includeTestnets, setIncludeTestnets] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { results, isLoading } = useChainSearch(query, {
    includeTestnets,
    requireRpc: true,
    limit: 8,
  })

  const configuredIds = useMemo(
    () => new Set(config.chains.map((chain) => chain.id)),
    // `config.chains` grows as chains are added, so read it on every render.
    [config, results],
  )

  async function addAndSwitch(entry: ChainEntry) {
    setBusyId(entry.id)
    setError(null)
    try {
      config.addChain(toViemChain(entry))
      if (isConnected) await switchChainAsync({ chainId: entry.id })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="card">
      <div className="card-header">
        <h2>Chain registry</h2>
        <p>Search all 2,725 EVM chains, then add one to the live config.</p>
      </div>
      <div className="card-content">
        <div className="row">
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chains — try “base”, “zksync”, “137”"
            aria-label="Search chains"
          />
          <label className="switch">
            <input
              type="checkbox"
              checked={includeTestnets}
              onChange={(event) => setIncludeTestnets(event.target.checked)}
            />
            Testnets
          </label>
        </div>

        {isLoading && <p className="error muted">Loading chain registry…</p>}
        {!isLoading && query && results.length === 0 && (
          <p className="error muted">No chains match “{query}”.</p>
        )}

        <ul className="chains">
        {results.map((entry) => {
          const configured = configuredIds.has(entry.id)
          return (
            <li key={entry.id}>
              <ChainLogo chainId={entry.id} size={32} />
              <span className="chain-name">
                {entry.name}
                <small>
                  {entry.nativeCurrency.symbol} · id {entry.id}
                  {entry.isTestnet && ' · testnet'}
                </small>
              </span>
              <button
                className="btn btn--outline btn--sm"
                onClick={() => void addAndSwitch(entry)}
                disabled={busyId === entry.id || entry.id === chainId}
              >
                {entry.id === chainId
                  ? 'Current'
                  : busyId === entry.id
                    ? 'Adding…'
                    : configured
                      ? 'Switch'
                      : 'Add & switch'}
              </button>
            </li>
          )
        })}
        </ul>

        {error && <p className="error">{error}</p>}
      </div>
    </section>
  )
}
