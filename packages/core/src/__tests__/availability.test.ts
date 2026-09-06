import { afterEach, describe, expect, it } from 'vitest'
import { mainnet } from 'viem/chains'

import { bitcoinMainnet, solanaMainnet } from '../caip.js'
import { createConfig } from '../config.js'
import { bitcoinWallets, BITCOIN_TARGETS } from '../connectors/bitcoin.js'
import { memoryStorage } from '../storage.js'

/**
 * Solana and Bitcoin wallets must only be offered when they are actually
 * installed. Unlike MetaMask, these have no install-and-return flow worth
 * showing: a row the user can click but that can only fail is worse than no
 * row at all.
 */

function setup() {
  return createConfig({
    chains: [mainnet],
    otherChains: [solanaMainnet, bitcoinMainnet],
    connectors: bitcoinWallets(),
    storage: memoryStorage(),
    autoReconnect: false,
    multiInjectedProviderDiscovery: false,
  })
}

/** The predicate the modal uses to decide whether to render a wallet row. */
const offered = (config: ReturnType<typeof setup>, namespace: 'solana' | 'bip122') =>
  config.getConnectors(namespace).filter((connector) => connector.isAvailable?.() !== false)

const injected: string[] = []
function install(key: string, value: unknown) {
  injected.push(key)
  ;(window as unknown as Record<string, unknown>)[key] = value
}

afterEach(() => {
  for (const key of injected.splice(0)) delete (window as unknown as Record<string, unknown>)[key]
})

describe('bitcoin wallet availability', () => {
  it('registers a connector per supported wallet', () => {
    const config = setup()
    expect(config.getConnectors('bip122')).toHaveLength(BITCOIN_TARGETS.length)
  })

  it('offers none of them when no wallet is installed', () => {
    const config = setup()
    expect(offered(config, 'bip122')).toEqual([])
  })

  it('offers only the wallet that is actually installed', () => {
    install('unisat', { requestAccounts: () => [] })
    const config = setup()

    const available = offered(config, 'bip122')
    expect(available).toHaveLength(1)
    expect(available[0]!.name).toBe('UniSat')
  })

  it('picks up a second wallet without offering the rest', () => {
    install('unisat', { requestAccounts: () => [] })
    install('LeatherProvider', { request: () => ({}) })
    const config = setup()

    expect(offered(config, 'bip122').map((connector) => connector.name).sort()).toEqual([
      'Leather',
      'UniSat',
    ])
  })
})

describe('solana wallet availability', () => {
  it('has no connectors at all until a wallet announces itself', () => {
    const config = setup()
    // Wallet Standard connectors are created by discovery, one per wallet that
    // registers itself — so an absent wallet cannot produce a row.
    expect(config.getConnectors('solana')).toEqual([])
    expect(offered(config, 'solana')).toEqual([])
  })
})
