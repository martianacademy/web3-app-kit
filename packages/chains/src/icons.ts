import { chainIconUrl, chainIconUrls, type IconUrlOptions } from './gateway.js'
import type { ChainIcon } from './types.js'

type IconsPayload = {
  v: number
  generatedAt: string
  /** Interned IPFS images; several chains share the same mark. */
  ipfs: Array<[cid: string, format: string]>
  byChain: Array<[chainId: number, ipfsIndex: number, cdnSlug: string]>
}

type BundledPayload = {
  v: number
  generatedAt: string
  /** Pixel dimensions the logos were rendered at. */
  size: number
  /** Interned `data:` URIs. */
  images: string[]
  byChain: Array<[chainId: number, imageIndex: number]>
}

export type ChainIcons = {
  /** Number of chains with at least one logo source. */
  readonly size: number
  /** Number of chains whose logo ships inside the package. */
  readonly bundledCount: number
  readonly generatedAt: string
  get(chainId: number): ChainIcon | undefined
  /** Best source for the chain's logo, or `undefined` when unknown. */
  url(chainId: number, options?: IconUrlOptions): string | undefined
  /**
   * Every source worth trying, best first: the bundled data URI, then the CDN,
   * then each IPFS gateway. Image renderers should walk this list on error —
   * coverage is split across the three and public gateways pin unevenly.
   */
  urls(chainId: number, options?: IconUrlOptions): string[]
}

export type LoadChainIconsOptions = {
  /**
   * Include the bundled data URIs. On by default; they are what make the
   * common chains render sharply with no network at all. Pass `false` to skip
   * that chunk (~326 KB) and rely on the CDN and IPFS URLs instead.
   */
  bundled?: boolean
}

const cache = new Map<boolean, Promise<ChainIcons>>()

/**
 * Loads the logo table. The datasets are dynamically imported, so bundlers
 * split them out and an app that never renders a chain logo downloads neither.
 */
export function loadChainIcons(options: LoadChainIconsOptions = {}): Promise<ChainIcons> {
  const withBundled = options.bundled ?? true

  let promise = cache.get(withBundled)
  if (!promise) {
    promise = load(withBundled)
    cache.set(withBundled, promise)
  }
  return promise
}

async function load(withBundled: boolean): Promise<ChainIcons> {
  const [icons, bundled] = await Promise.all([
    import('./data/icons.js').then(({ ICONS_JSON }) => JSON.parse(ICONS_JSON) as IconsPayload),
    withBundled
      ? import('./data/bundled-icons.js')
          .then(({ BUNDLED_ICONS_JSON }) => JSON.parse(BUNDLED_ICONS_JSON) as BundledPayload)
          // The bundled set is an optimisation; without it the URLs still work.
          .catch(() => undefined)
      : Promise.resolve(undefined),
  ])

  return buildIcons(icons, bundled)
}

function buildIcons(payload: IconsPayload, bundled: BundledPayload | undefined): ChainIcons {
  const byChain = new Map<number, ChainIcon>()

  for (const [chainId, ipfsIndex, cdnSlug] of payload.byChain) {
    const icon: ChainIcon = {}
    const image = ipfsIndex >= 0 ? payload.ipfs[ipfsIndex] : undefined
    if (image) icon.ipfs = { cid: image[0], format: image[1] }
    if (cdnSlug) icon.cdn = cdnSlug
    if (icon.ipfs || icon.cdn) byChain.set(chainId, icon)
  }

  let bundledCount = 0
  for (const [chainId, index] of bundled?.byChain ?? []) {
    const uri = bundled?.images[index]
    if (!uri) continue
    bundledCount++
    const existing = byChain.get(chainId)
    if (existing) existing.bundled = uri
    else byChain.set(chainId, { bundled: uri })
  }

  return {
    size: byChain.size,
    bundledCount,
    generatedAt: payload.generatedAt,
    get: (chainId) => byChain.get(chainId),
    url: (chainId, options) => chainIconUrl(byChain.get(chainId), options),
    urls: (chainId, options) => chainIconUrls(byChain.get(chainId), options),
  }
}
