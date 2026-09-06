import { describe, expect, it } from 'vitest'
import { mainnet } from 'viem/chains'

import { connect, disconnect, disconnectAll, getAccount, getConnections } from '../actions/index.js'
import {
  bitcoinMainnet,
  parseCaip2,
  solanaMainnet,
  toCaip2,
  type ChainNamespace,
} from '../caip.js'
import { createConfig } from '../config.js'
import { memoryStorage } from '../storage.js'
import { mockConnector } from './mockConnector.js'

function setup() {
  const evm = mockConnector({ id: 'evm', namespace: 'eip155', chainId: mainnet.id })
  const sol = mockConnector({
    id: 'sol',
    namespace: 'solana',
    name: 'Phantom',
    accounts: ['9xQeWvG816bUx9EPa2mTvKMrsSTA6nQNHfWuEwmv6ffn' as never],
  })
  const btc = mockConnector({
    id: 'btc',
    namespace: 'bip122',
    name: 'UniSat',
    accounts: ['bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' as never],
  })
  const storage = memoryStorage()
  const config = createConfig({
    chains: [mainnet],
    otherChains: [solanaMainnet, bitcoinMainnet],
    connectors: [evm.create, sol.create, btc.create],
    storage,
    autoReconnect: false,
    multiInjectedProviderDiscovery: false,
    walletStandardDiscovery: false,
  })
  return { config, storage, evm, sol, btc }
}

describe('CAIP-2', () => {
  it('round-trips an id', () => {
    expect(toCaip2('eip155', 1)).toBe('eip155:1')
    expect(parseCaip2('eip155:1')).toEqual({ namespace: 'eip155', reference: '1' })
    expect(parseCaip2(solanaMainnet.caip2)?.namespace).toBe('solana')
  })

  it('rejects ids outside the supported namespaces', () => {
    expect(parseCaip2('cosmos:cosmoshub-4')).toBeUndefined()
    expect(parseCaip2('eip155')).toBeUndefined()
    expect(parseCaip2('eip155:')).toBeUndefined()
  })
})

describe('namespaces', () => {
  it('groups chains and connectors by ecosystem', () => {
    const { config } = setup()

    expect(config.getChains('eip155').map((chain) => chain.name)).toEqual(['Ethereum'])
    expect(config.getChains('solana')).toHaveLength(1)
    expect(config.getChains('bip122')).toHaveLength(1)
    expect(config.getConnectors('solana').map((c) => c.name)).toEqual(['Phantom'])
    expect(new Set(config.getNamespaces())).toEqual(
      new Set<ChainNamespace>(['eip155', 'solana', 'bip122']),
    )
  })

  it('holds one connection per namespace at the same time', async () => {
    const { config } = setup()

    await connect(config, { connector: 'evm' })
    await connect(config, { connector: 'sol' })
    await connect(config, { connector: 'btc' })

    expect(getAccount(config).isConnected).toBe(true)
    expect(getAccount(config, { namespace: 'solana' }).isConnected).toBe(true)
    expect(getAccount(config, { namespace: 'bip122' }).isConnected).toBe(true)
    expect(getConnections(config)).toHaveLength(3)
  })

  it('does not evict one ecosystem when another connects', async () => {
    const { config } = setup()

    await connect(config, { connector: 'evm' })
    const evmAddress = getAccount(config).address

    await connect(config, { connector: 'sol' })

    expect(getAccount(config).address).toBe(evmAddress)
    expect(getAccount(config).isConnected).toBe(true)
  })

  it('disconnects one namespace and leaves the rest alone', async () => {
    const { config } = setup()
    await connect(config, { connector: 'evm' })
    await connect(config, { connector: 'sol' })

    await disconnect(config, { namespace: 'solana' })

    expect(getAccount(config, { namespace: 'solana' }).isConnected).toBe(false)
    expect(getAccount(config).isConnected).toBe(true)
  })

  it('disconnects everything at once when asked', async () => {
    const { config } = setup()
    await connect(config, { connector: 'evm' })
    await connect(config, { connector: 'sol' })

    await disconnectAll(config)

    expect(getConnections(config)).toHaveLength(0)
  })

  it('persists the recent connector per namespace', async () => {
    const { config, storage } = setup()

    await connect(config, { connector: 'evm' })
    await connect(config, { connector: 'sol' })

    expect(storage.getItem('recentConnectorId.eip155')).toBe('evm')
    expect(storage.getItem('recentConnectorId.solana')).toBe('sol')

    await disconnect(config, { namespace: 'solana' })
    expect(storage.getItem('recentConnectorId.solana')).toBeNull()
    expect(storage.getItem('recentConnectorId.eip155')).toBe('evm')
  })

  it('tags each connection with its CAIP-2 id', async () => {
    const { config } = setup()
    await connect(config, { connector: 'evm' })
    await connect(config, { connector: 'sol' })

    expect(config.state.connections.eip155?.caip2).toBe('eip155:1')
    expect(config.state.connections.solana?.caip2).toBe(solanaMainnet.caip2)
  })

  it('routes wallet events to the right namespace', async () => {
    const { config, sol, evm } = setup()
    await connect(config, { connector: 'evm' })
    await connect(config, { connector: 'sol' })

    sol.handle.emitAccountsChanged(['7NsngNMtXJNdHgeK4znQDZ5PJ19ykVvQvEF7BT5KFjMv' as never])

    expect(getAccount(config, { namespace: 'solana' }).address).toBe(
      '7NsngNMtXJNdHgeK4znQDZ5PJ19ykVvQvEF7BT5KFjMv',
    )
    // The EVM side must not have moved.
    expect(getAccount(config).address).toBe('0x0000000000000000000000000000000000000001')

    evm.handle.emitDisconnect()
    expect(getAccount(config).isConnected).toBe(false)
    expect(getAccount(config, { namespace: 'solana' }).isConnected).toBe(true)
  })
})
