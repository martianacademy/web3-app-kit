import { describe, expect, it, vi } from 'vitest'
import { base, mainnet } from 'viem/chains'

import {
  connect,
  disconnect,
  getAccount,
  getChainId,
  switchChain,
  watchAccount,
} from '../actions/index.js'
import { createConfig } from '../config.js'
import { UserRejectedRequestError } from '../errors.js'
import { memoryStorage } from '../storage.js'
import { mockConnector } from './mockConnector.js'

const CHAINS = [mainnet, base] as const

function setup(parameters: Parameters<typeof mockConnector>[0] = {}) {
  const { create, handle } = mockConnector(parameters)
  const storage = memoryStorage()
  const config = createConfig({
    chains: CHAINS,
    connectors: [create],
    storage,
    autoReconnect: false,
    multiInjectedProviderDiscovery: false,
  })
  return { config, handle, storage }
}

describe('createConfig', () => {
  it('starts disconnected on the first chain', () => {
    const { config } = setup()
    expect(getAccount(config).status).toBe('disconnected')
    expect(getChainId(config)).toBe(mainnet.id)
    expect(config.connectors).toHaveLength(1)
  })

  it('falls back to a default transport for unconfigured chains', () => {
    const { config } = setup()
    expect(config.getTransport(mainnet.id)).toBeTypeOf('function')
  })
})

describe('connect', () => {
  it('moves through connecting into connected and persists the connector', async () => {
    const { config, storage } = setup()
    const states: string[] = []
    config.subscribe(() => {
      const status = getAccount(config).status
      if (states[states.length - 1] !== status) states.push(status)
    })

    const result = await connect(config, { connector: 'mock' })

    expect(states).toEqual(['connecting', 'connected'])
    expect(result.accounts).toHaveLength(1)
    expect(getAccount(config).address).toBe(result.accounts[0])
    expect(storage.getItem('recentConnectorId.eip155')).toBe('mock')
  })

  it('honours a requested chain id', async () => {
    const { config } = setup()
    await connect(config, { connector: 'mock', chainId: base.id })
    expect(getChainId(config)).toBe(base.id)
  })

  it('records the error and resets state when the user rejects', async () => {
    const { config, storage } = setup({ failConnect: new UserRejectedRequestError() })

    await expect(connect(config, { connector: 'mock' })).rejects.toBeInstanceOf(
      UserRejectedRequestError,
    )
    expect(getAccount(config).status).toBe('disconnected')
    expect(getAccount(config).address).toBeUndefined()
    expect(config.state.errors.eip155).toBeInstanceOf(UserRejectedRequestError)
    expect(storage.getItem('recentConnectorId.eip155')).toBeNull()
  })

  it('throws for an unknown connector id', async () => {
    const { config } = setup()
    await expect(connect(config, { connector: 'nope' })).rejects.toThrow(/not registered/)
  })
})

describe('connector events', () => {
  it('applies account changes from the wallet', async () => {
    const { config, handle } = setup()
    await connect(config, { connector: 'mock' })

    handle.emitAccountsChanged(['0x00000000000000000000000000000000000000ff'])
    expect(getAccount(config).address).toBe('0x00000000000000000000000000000000000000ff')
  })

  it('treats an empty accounts array as a disconnect', async () => {
    const { config, handle, storage } = setup()
    await connect(config, { connector: 'mock' })

    handle.emitAccountsChanged([])
    expect(getAccount(config).status).toBe('disconnected')
    expect(storage.getItem('recentConnectorId.eip155')).toBeNull()
  })

  it('applies chain changes from the wallet', async () => {
    const { config, handle } = setup()
    await connect(config, { connector: 'mock' })

    handle.emitChainChanged(base.id)
    expect(getChainId(config)).toBe(base.id)
  })

  it('ignores events from a connector that is not the active one', async () => {
    const { create: createOther, handle: other } = mockConnector({ id: 'other' })
    const { create, handle } = mockConnector({ id: 'mock' })
    const config = createConfig({
      chains: CHAINS,
      connectors: [create, createOther],
      storage: memoryStorage(),
      autoReconnect: false,
      multiInjectedProviderDiscovery: false,
    })

    await connect(config, { connector: 'mock' })
    other.emitDisconnect()

    expect(getAccount(config).status).toBe('connected')
    handle.emitDisconnect()
    expect(getAccount(config).status).toBe('disconnected')
  })
})

describe('disconnect', () => {
  it('clears state and persistence', async () => {
    const { config, handle, storage } = setup()
    await connect(config, { connector: 'mock' })

    await disconnect(config)

    expect(handle.disconnectCalls).toBe(1)
    expect(getAccount(config).status).toBe('disconnected')
    expect(getAccount(config).addresses).toEqual([])
    expect(storage.getItem('recentConnectorId.eip155')).toBeNull()
  })
})

describe('switchChain', () => {
  it('switches through the connector when connected', async () => {
    const { config } = setup()
    await connect(config, { connector: 'mock' })

    const chain = await switchChain(config, { chainId: base.id })

    expect(chain.reference).toBe(String(base.id))
    expect(getChainId(config)).toBe(base.id)
  })

  it('is a local preference while disconnected', async () => {
    const { config } = setup()
    await switchChain(config, { chainId: base.id })
    expect(getChainId(config)).toBe(base.id)
    expect(getAccount(config).status).toBe('disconnected')
  })

  it('rejects chains outside the config', async () => {
    const { config } = setup()
    await expect(switchChain(config, { chainId: 999 })).rejects.toThrow(/not present/)
  })
})

describe('reconnect', () => {
  function setupWithSession(authorized: boolean) {
    const { create } = mockConnector({ authorized })
    const storage = memoryStorage()
    // `createConfig` reads this key directly off the storage it is given.
    storage.setItem('recentConnectorId.eip155', 'mock')
    const config = createConfig({
      chains: CHAINS,
      connectors: [create],
      storage,
      autoReconnect: false,
      multiInjectedProviderDiscovery: false,
    })
    return { config, storage }
  }

  it('restores the session when the wallet still authorizes it', async () => {
    const { config } = setupWithSession(true)
    await config.reconnect()

    expect(getAccount(config).status).toBe('connected')
    expect(getAccount(config).connector?.id).toBe('mock')
    expect(getAccount(config).address).toBeDefined()
  })

  it('stays disconnected and clears persistence when access was revoked', async () => {
    const { config, storage } = setupWithSession(false)
    await config.reconnect()

    expect(getAccount(config).status).toBe('disconnected')
    expect(storage.getItem('recentConnectorId.eip155')).toBeNull()
  })

  it('does nothing when there is no stored session', async () => {
    const { config } = setup()
    await config.reconnect()
    expect(getAccount(config).status).toBe('disconnected')
  })
})

describe('watchAccount', () => {
  it('fires on meaningful changes only', async () => {
    const { config } = setup()
    const listener = vi.fn()
    const unwatch = watchAccount(config, listener)

    await connect(config, { connector: 'mock' })
    expect(listener).toHaveBeenCalledTimes(2) // connecting, then connected

    config.setState({ errors: { eip155: new Error('unrelated') } })
    expect(listener).toHaveBeenCalledTimes(2)

    unwatch()
    await disconnect(config)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('exposes a derived account snapshot', async () => {
    const { config } = setup()
    await connect(config, { connector: 'mock' })

    const account = getAccount(config)
    expect(account.isConnected).toBe(true)
    expect(account.chain?.id).toBe(mainnet.id)
    expect(account.connector?.id).toBe('mock')
  })
})
