import { useEffect, useMemo, useState } from 'react'
import {
  useChainIcons,
  useChainRegistry,
  type ChainEntry,
  type ChainIconSource,
} from '@web3-app-kit/react'

type Scope = 'bundled' | 'all'

const SOURCES: ReadonlyArray<{ id: ChainIconSource; label: string }> = [
  { id: 'bundled', label: 'Bundled' },
  { id: 'cdn', label: 'CDN' },
  { id: 'ipfs', label: 'IPFS' },
]

/**
 * A contact sheet of every chain logo the SDK can render, so bad artwork is
 * findable by eye. Upstream sources disagree — some marks are outdated, some
 * are drawn on transparency — and the only reliable way to catch that is to
 * look at all of them at once.
 */
export function LogoAudit() {
  const { data: registry } = useChainRegistry()
  const { data: icons } = useChainIcons()

  const [scope, setScope] = useState<Scope>('bundled')
  const [compare, setCompare] = useState(false)
  const [masked, setMasked] = useState(true)
  const [query, setQuery] = useState('')

  const chains = useMemo(() => {
    if (!registry || !icons) return []
    const all = registry.all({ includeTestnets: true, includeDeprecated: true })
    const withLogo = all.filter((chain) => {
      const icon = icons.get(chain.id)
      if (!icon) return false
      return scope === 'all' || !!icon.bundled
    })
    const needle = query.trim().toLowerCase()
    if (!needle) return withLogo
    return withLogo.filter(
      (chain) =>
        chain.name.toLowerCase().includes(needle) || String(chain.id).startsWith(needle),
    )
  }, [registry, icons, scope, query])

  if (!registry || !icons)
    return (
      <section className="card">
        <div className="card-header">
          <h2>Logo audit</h2>
          <p>Loading the chain registry…</p>
        </div>
      </section>
    )

  return (
    <section className="card">
      <div className="card-header">
        <h2>Logo audit</h2>
        <p>
          {chains.length} chains · {icons.bundledCount} ship a bundled logo. Spot the wrong ones
          and note their chain id.
        </p>
      </div>
      <div className="card-content">
        <div className="row">
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name or chain id"
            aria-label="Filter chains"
          />
          <label className="switch">
            <input
              type="checkbox"
              checked={scope === 'all'}
              onChange={(event) => setScope(event.target.checked ? 'all' : 'bundled')}
            />
            Include URL-only chains
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={masked}
              onChange={(event) => setMasked(event.target.checked)}
            />
            Hexagon mask
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={compare}
              onChange={(event) => setCompare(event.target.checked)}
            />
            Compare sources
          </label>
        </div>

        <ul className={`audit${masked ? ' audit--masked' : ''}`}>
          {chains.map((chain) => (
            <AuditTile key={chain.id} chain={chain} compare={compare} />
          ))}
        </ul>
      </div>
    </section>
  )
}

function AuditTile({ chain, compare }: { chain: ChainEntry; compare: boolean }) {
  const { data: icons } = useChainIcons()
  const icon = icons?.get(chain.id)

  const format = icon?.bundled
    ? icon.bundled.slice(11, icon.bundled.indexOf(';'))
    : icon?.cdn
      ? 'cdn'
      : 'ipfs'

  return (
    <li>
      <div className="audit-marks">
        {compare ? (
          SOURCES.map((source) => (
            <AuditImage
              key={source.id}
              chainId={chain.id}
              source={source.id}
              title={source.label}
            />
          ))
        ) : (
          <AuditImage chainId={chain.id} />
        )}
      </div>
      <span className="audit-name" title={chain.name}>
        {chain.name}
      </span>
      <span className="audit-meta">
        {chain.id} · {format}
      </span>
    </li>
  )
}

/** One logo, walking the source list on error exactly as the modal does. */
function AuditImage({
  chainId,
  source,
  title,
}: {
  chainId: number
  source?: ChainIconSource
  title?: string
}) {
  const { data: icons } = useChainIcons()
  const urls = useMemo(
    () => (icons ? icons.urls(chainId, source ? { sources: [source] } : {}) : []),
    [icons, chainId, source],
  )
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [urls])

  const src = urls[index]
  if (!src) return <span className="audit-mark audit-mark--empty" title={title} />

  return (
    <img
      className="audit-mark"
      src={src}
      alt=""
      loading="lazy"
      title={title}
      onError={() => setIndex((current) => current + 1)}
    />
  )
}
