import type { ChainIcon } from './types.js'

/**
 * Logos come from three places, because none covers every chain on its own:
 *
 * - **bundled** — a `data:` URI inside the package, rendered at a known
 *   resolution from the best source available at build time. No network, no
 *   hosting, and no surprises: the public sources disagree badly on quality
 *   (the CDN serves Ethereum as a 28x28 thumbnail). Covers ~150 chains.
 *
 * - **CDN** — DefiLlama's public chain-icon CDN. Fast and reliably available,
 *   and the only source for several of the largest chains, but it only covers
 *   the ~235 chains DefiLlama tracks, and requests reveal the viewer's IP to a
 *   third party. Pass `sources: ['ipfs']` to opt out.
 * - **IPFS** — the images published by ethereum-lists/chains, covering ~1,880
 *   chains. Canonical, but individual CIDs are pinned unevenly across public
 *   gateways: one that times out on `ipfs.io` often resolves instantly on
 *   `dweb.link`.
 *
 * Because of that unevenness, image renderers should use {@link chainIconUrls}
 * and advance through the list on `error` rather than trusting one URL.
 */
export const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io/ipfs'

/** Public gateways, in the order this package recommends trying them. */
export const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs',
  'https://dweb.link/ipfs',
  'https://gateway.pinata.cloud/ipfs',
] as const

export const DEFAULT_ICON_CDN = 'https://icons.llamao.fi/icons/chains'

export type ChainIconSource = 'bundled' | 'cdn' | 'ipfs'

const DEFAULT_SOURCES: readonly ChainIconSource[] = ['bundled', 'cdn', 'ipfs']

let gateway: string = DEFAULT_IPFS_GATEWAY
let cdnBaseUrl: string = DEFAULT_ICON_CDN

export function setIpfsGateway(url: string): void {
  gateway = trimSlashes(url)
}

export function getIpfsGateway(): string {
  return gateway
}

/** Point chain logos at your own mirror of the CDN, or disable it per call. */
export function setIconCdn(baseUrl: string): void {
  cdnBaseUrl = trimSlashes(baseUrl)
}

export function getIconCdn(): string {
  return cdnBaseUrl
}

export type IconUrlOptions = {
  /** Overrides the configured IPFS gateway for this call. */
  gateway?: string
  /** Overrides the whole IPFS fallback list. */
  gateways?: readonly string[]
  /** Overrides the CDN base URL for this call. */
  cdnBaseUrl?: string
  /** Which sources to use, in order. Defaults to `['bundled', 'cdn', 'ipfs']`. */
  sources?: readonly ChainIconSource[]
}

/** Resolves a chain logo to a single HTTPS URL. */
export function chainIconUrl(
  icon: ChainIcon | undefined,
  options: IconUrlOptions = {},
): string | undefined {
  return chainIconUrls(icon, options)[0]
}

/**
 * Every URL worth trying for this logo, best first. Render the first one and
 * advance to the next on an `error` event.
 */
export function chainIconUrls(
  icon: ChainIcon | undefined,
  options: IconUrlOptions = {},
): string[] {
  if (!icon) return []

  const sources = options.sources ?? DEFAULT_SOURCES
  const urls: string[] = []
  const seen = new Set<string>()
  const push = (url: string) => {
    if (seen.has(url)) return
    seen.add(url)
    urls.push(url)
  }

  for (const source of sources) {
    if (source === 'bundled' && icon.bundled) push(icon.bundled)
    if (source === 'cdn' && icon.cdn) {
      const base = trimSlashes(options.cdnBaseUrl ?? cdnBaseUrl)
      push(`${base}/rsz_${encodeURIComponent(icon.cdn)}.jpg`)
    }
    if (source === 'ipfs' && icon.ipfs) {
      const gateways = options.gateways ?? [options.gateway ?? gateway, ...IPFS_GATEWAYS]
      for (const candidate of gateways) {
        const base = trimSlashes(candidate)
        if (base) push(`${base}/${icon.ipfs.cid}`)
      }
    }
  }

  return urls
}

function trimSlashes(url: string): string {
  return url.trim().replace(/\/+$/, '')
}
