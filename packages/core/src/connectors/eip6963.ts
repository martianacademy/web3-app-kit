import type { EIP1193Provider } from 'viem'

import type { Config } from '../config.js'
import { createEmitter } from '../emitter.js'
import type { Connector } from '../types.js'
import { injected } from './injected.js'

/** EIP-6963 `EIP6963ProviderInfo`. */
export type Eip6963ProviderInfo = {
  uuid: string
  name: string
  icon: string
  rdns: string
}

export type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo
  provider: EIP1193Provider
}

type AnnounceEvent = CustomEvent<Eip6963ProviderDetail>

const ANNOUNCE = 'eip6963:announceProvider'
const REQUEST = 'eip6963:requestProvider'

/**
 * Listens for EIP-6963 announcements and registers one connector per wallet.
 * This is what makes multiple installed extensions selectable instead of them
 * fighting over `window.ethereum`.
 */
export function startEip6963Discovery(config: Config): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    const detail = (event as AnnounceEvent).detail
    if (!detail?.info?.rdns || !detail.provider) return
    config._internal.registerConnector(createEip6963Connector(config, detail))
  }

  window.addEventListener(ANNOUNCE, handler)
  window.dispatchEvent(new Event(REQUEST))

  // Wallets that load after us re-announce on request; ask again once the
  // page has settled so late extensions are not missed.
  const timer = setTimeout(() => window.dispatchEvent(new Event(REQUEST)), 500)

  return () => {
    clearTimeout(timer)
    window.removeEventListener(ANNOUNCE, handler)
  }
}

function createEip6963Connector(config: Config, detail: Eip6963ProviderDetail): Connector {
  const { info, provider } = detail
  return injected({
    target: {
      id: info.rdns,
      name: info.name,
      icon: info.icon,
      rdns: info.rdns,
      provider: () => provider,
    },
  })({
    chains: config.chains,
    allChains: config.allChains,
    emitter: createEmitter(),
    storage: config.storage,
  })
}

/**
 * One-shot scan that resolves with every wallet announced within `timeout`.
 * Useful outside of a config — for a custom wallet picker, for example.
 */
export function discoverProviders(timeout = 500): Promise<Eip6963ProviderDetail[]> {
  if (typeof window === 'undefined') return Promise.resolve([])
  return new Promise((resolve) => {
    const found = new Map<string, Eip6963ProviderDetail>()
    const handler = (event: Event) => {
      const detail = (event as AnnounceEvent).detail
      if (detail?.info?.rdns) found.set(detail.info.rdns, detail)
    }
    window.addEventListener(ANNOUNCE, handler)
    window.dispatchEvent(new Event(REQUEST))
    setTimeout(() => {
      window.removeEventListener(ANNOUNCE, handler)
      resolve([...found.values()])
    }, timeout)
  })
}
