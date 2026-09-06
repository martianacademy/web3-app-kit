import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ICON_CDN,
  DEFAULT_IPFS_GATEWAY,
  IPFS_GATEWAYS,
  chainIconUrl,
  chainIconUrls,
  loadChainIcons,
  loadChainRegistry,
  setIpfsGateway,
  toViemChain,
} from './index.js'

describe('loadChainRegistry', () => {
  it('parses the generated dataset once and reuses it', async () => {
    const a = await loadChainRegistry()
    const b = await loadChainRegistry()
    expect(a).toBe(b)
    expect(a.size).toBeGreaterThan(2000)
    expect(a.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('looks chains up by id', async () => {
    const registry = await loadChainRegistry()
    const ethereum = registry.get(1)

    expect(ethereum?.name).toBe('Ethereum Mainnet')
    expect(ethereum?.shortName).toBe('eth')
    expect(ethereum?.nativeCurrency).toEqual({ name: 'Ether', symbol: 'ETH', decimals: 18 })
    expect(ethereum?.rpcUrls.length).toBeGreaterThan(0)
    expect(ethereum?.blockExplorer?.url).toContain('etherscan.io')
    expect(ethereum?.isTestnet).toBe(false)
  })

  it('looks chains up by short name, case-insensitively', async () => {
    const registry = await loadChainRegistry()
    expect(registry.getByShortName('base')?.id).toBe(8453)
    expect(registry.getByShortName('  ARB1 ')?.id).toBe(42161)
    expect(registry.getByShortName('definitely-not-a-chain')).toBeUndefined()
  })

  it('only keeps usable https RPC endpoints', async () => {
    const registry = await loadChainRegistry()
    for (const entry of registry.all().slice(0, 400))
      for (const url of entry.rpcUrls) {
        expect(url.startsWith('https://')).toBe(true)
        expect(url).not.toContain('${')
      }
  })

  it('carries the settlement layer for chains that declare one', async () => {
    const registry = await loadChainRegistry()
    // Upstream only records `parent` for some rollups — Arbitrum and zkSync
    // declare it, Base and Optimism currently do not.
    expect(registry.get(42161)?.parentChainId).toBe(1)
    expect(registry.get(324)?.parentChainId).toBe(1)
    expect(registry.get(8453)?.parentChainId).toBeUndefined()
  })
})

describe('search', () => {
  it('ranks an exact id above a name match', async () => {
    const registry = await loadChainRegistry()
    expect(registry.search('137')[0]?.id).toBe(137)
  })

  it('ranks an exact short name first', async () => {
    const registry = await loadChainRegistry()
    expect(registry.search('base')[0]?.id).toBe(8453)
    expect(registry.search('oeth')[0]?.id).toBe(10)
  })

  it('excludes testnets unless asked', async () => {
    const registry = await loadChainRegistry()
    expect(registry.search('sepolia', { limit: 50 })).toHaveLength(0)
    expect(
      registry.search('sepolia', { includeTestnets: true, limit: 50 }).length,
    ).toBeGreaterThan(0)
  })

  it('can require a usable RPC endpoint', async () => {
    const registry = await loadChainRegistry()
    const results = registry.search('chain', { requireRpc: true, limit: 50 })
    for (const entry of results) expect(entry.rpcUrls.length).toBeGreaterThan(0)
  })

  it('returns nothing for an empty query', async () => {
    const registry = await loadChainRegistry()
    expect(registry.search('   ')).toEqual([])
  })

  it('honours the limit', async () => {
    const registry = await loadChainRegistry()
    expect(registry.search('net', { limit: 5 })).toHaveLength(5)
  })
})

describe('icons', () => {
  it('covers every logo source', async () => {
    const icons = await loadChainIcons()
    expect(icons.size).toBeGreaterThan(1800)

    // ethereum-lists publishes an IPFS image for Ethereum…
    expect(icons.get(1)?.ipfs?.cid).toMatch(/^(Qm|bafy)/)
    // …but not for OP Mainnet or BNB Smart Chain, which the CDN covers.
    expect(icons.get(10)?.ipfs).toBeUndefined()
    expect(icons.get(10)?.cdn).toBe('optimism')
    expect(icons.get(56)?.cdn).toBeTruthy()
    expect(icons.get(42161)?.cdn).toBe('arbitrum')
  })

  it('returns undefined for a chain with no logo', async () => {
    const icons = await loadChainIcons()
    expect(icons.get(-1)).toBeUndefined()
    expect(icons.url(-1)).toBeUndefined()
  })

  it('ships bundled logos for the chains dApps actually use', async () => {
    const icons = await loadChainIcons()

    expect(icons.bundledCount).toBeGreaterThan(100)
    for (const chainId of [1, 8453, 42161, 10, 137, 56, 11155111]) {
      const bundled = icons.get(chainId)?.bundled
      expect(bundled, `chain ${chainId}`).toMatch(/^data:image\/(png|webp|svg\+xml);base64,/)
    }
  })

  it('uses a full-bleed vector tile for the chains that have one', async () => {
    const icons = await loadChainIcons()
    // These are masked into a hexagon by the UI, so the artwork has to fill
    // its box. A bare mark on transparency leaves nothing to mask.
    for (const chainId of [1, 10, 42161, 137, 56, 43114])
      expect(icons.get(chainId)?.bundled, `chain ${chainId}`).toMatch(
        /^data:image\/svg\+xml;base64,/,
      )
  })

  it('honours the per-chain artwork overrides', async () => {
    const icons = await loadChainIcons()
    // Base has a vector mark, but it is drawn inverted — white square on blue,
    // when Base's mark *is* the blue square — so it is pinned to a raster
    // source instead. Shape is pinned because its own artwork is a black
    // circle that vanishes on a dark surface until it is flattened.
    for (const chainId of [8453, 360])
      expect(icons.get(chainId)?.bundled, `chain ${chainId}`).toMatch(
        /^data:image\/(png|webp);base64,/,
      )
    // The override reaches Base Sepolia through the testnet alias.
    expect(icons.get(84532)?.bundled).toBe(icons.get(8453)?.bundled)
  })

  it('renders an opaque raster for chains with no vector mark', async () => {
    const icons = await loadChainIcons()
    // opBNB and BitTorrent Chain have no web3icons mark, so they come from
    // the raster pipeline — flattened, never transparent.
    for (const chainId of [204, 199])
      expect(icons.get(chainId)?.bundled, `chain ${chainId}`).toMatch(
        /^data:image\/(png|webp);base64,/,
      )
  })

  it('gives a testnet the same artwork as its mainnet', async () => {
    const icons = await loadChainIcons()
    expect(icons.get(11155111)?.bundled).toBe(icons.get(1)?.bundled)
    expect(icons.get(84532)?.bundled).toBe(icons.get(8453)?.bundled)
  })

  it('prefers the bundled logo, then the CDN, then every IPFS gateway', async () => {
    const icons = await loadChainIcons()
    const urls = icons.urls(1)

    expect(urls[0]).toBe(icons.get(1)!.bundled)
    expect(urls[1]).toBe(`${DEFAULT_ICON_CDN}/rsz_ethereum.jpg`)
    expect(urls.slice(2)).toEqual(
      IPFS_GATEWAYS.map((base) => `${base}/${icons.get(1)!.ipfs!.cid}`),
    )
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('can drop the bundled chunk entirely', async () => {
    const icons = await loadChainIcons({ bundled: false })

    expect(icons.bundledCount).toBe(0)
    expect(icons.get(1)?.bundled).toBeUndefined()
    expect(icons.urls(1)[0]).toBe(`${DEFAULT_ICON_CDN}/rsz_ethereum.jpg`)
  })

  it('can be restricted to IPFS only, for privacy', async () => {
    const icons = await loadChainIcons()
    const urls = icons.urls(1, { sources: ['ipfs'] })

    expect(urls.every((url) => !url.includes('llamao'))).toBe(true)
    expect(urls.every((url) => !url.startsWith('data:'))).toBe(true)
    expect(urls).toHaveLength(IPFS_GATEWAYS.length)
    // A CDN-only chain still resolves, because its logo is bundled.
    expect(icons.urls(10, { sources: ['ipfs'] })).toEqual([])
    expect(icons.urls(10)[0]).toMatch(/^data:image\//)
  })

  it('puts an explicit gateway first without dropping the fallbacks', () => {
    const icon = { ipfs: { cid: 'QmTest', format: 'png' } }
    const urls = chainIconUrls(icon, { gateway: 'https://my.cdn/ipfs' })

    expect(urls[0]).toBe('https://my.cdn/ipfs/QmTest')
    expect(urls.length).toBe(IPFS_GATEWAYS.length + 1)
  })

  it('accepts a per-call CDN base url', () => {
    expect(chainIconUrl({ cdn: 'base' }, { cdnBaseUrl: 'https://my.cdn/chains/' })).toBe(
      'https://my.cdn/chains/rsz_base.jpg',
    )
  })

  it('returns no urls for an unknown logo', () => {
    expect(chainIconUrls(undefined)).toEqual([])
    expect(chainIconUrls({})).toEqual([])
  })

  it('honours a globally configured gateway', async () => {
    setIpfsGateway('https://example.test/ipfs')
    const icons = await loadChainIcons()
    expect(icons.urls(1, { sources: ['ipfs'] })[0]).toMatch(/^https:\/\/example\.test\/ipfs\//)
    setIpfsGateway(DEFAULT_IPFS_GATEWAY)
  })
})

describe('toViemChain', () => {
  it('produces a chain viem accepts', async () => {
    const registry = await loadChainRegistry()
    const chain = toViemChain(registry.get(8453)!)

    expect(chain.id).toBe(8453)
    expect(chain.name).toBe('Base')
    expect(chain.nativeCurrency.symbol).toBe('ETH')
    expect(chain.rpcUrls.default.http.length).toBeGreaterThan(0)
    expect(chain.blockExplorers?.default.url).toContain('basescan')
    expect(chain.testnet).toBeUndefined()
  })

  it('flags testnets', async () => {
    const registry = await loadChainRegistry()
    const sepolia = registry.get(11155111)!
    expect(toViemChain(sepolia).testnet).toBe(true)
  })
})
