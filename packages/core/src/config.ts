import { http, type Chain, type Transport } from 'viem'

import {
  fromViemChain,
  toCaip2,
  type Caip2,
  type ChainDescriptor,
  type ChainNamespace,
} from './caip.js'
import { createEmitter } from './emitter.js'
import { toError } from './errors.js'
import { createStorage, noopStorage } from './storage.js'
import { createStore, type Store } from './store.js'
import type {
  ChainId,
  Connection,
  ConnectionStatus,
  Connector,
  ConnectorEventMap,
  CreateConnectorFn,
  State,
  Storage,
} from './types.js'
import { deepEqualAccounts } from './utils.js'

const RECENT_CONNECTOR_PREFIX = 'recentConnectorId'

export type CreateConfigParameters = {
  /** EVM chains the dApp supports. The first one is the default. */
  chains: readonly [Chain, ...Chain[]]
  /**
   * Chains in other ecosystems. Solana and Bitcoin chains live here because
   * they are not viem chains; `chains` stays EVM-only so every existing EVM
   * call site keeps its types.
   */
  otherChains?: readonly ChainDescriptor[]
  /** Wallet integrations. Each declares the namespace it connects to. */
  connectors?: readonly CreateConnectorFn[]
  /** Per-chain RPC transport, EVM only. Falls back to the chain's public RPC. */
  transports?: Partial<Record<number, Transport>>
  /** Pass `null` to disable persistence entirely. */
  storage?: Storage | null
  /** Skip browser-only work (discovery, auto-reconnect) during SSR. */
  ssr?: boolean
  /** Discover installed EVM wallets via EIP-6963. Defaults to `true`. */
  multiInjectedProviderDiscovery?: boolean
  /**
   * Discover Solana wallets via Wallet Standard. Defaults to `true` when the
   * config has at least one Solana chain.
   */
  walletStandardDiscovery?: boolean
  /** Automatically restore previous sessions on creation. Defaults to `true`. */
  autoReconnect?: boolean
}

export type Config = {
  readonly chains: readonly [Chain, ...Chain[]]
  /** Every chain across every namespace, EVM ones included. */
  readonly allChains: readonly ChainDescriptor[]
  /** Static connectors plus anything discovery has found so far. */
  readonly connectors: readonly Connector[]
  readonly state: State
  readonly storage: Storage
  readonly store: Store<State>
  subscribe: Store<State>['subscribe']
  subscribeWith: Store<State>['subscribeWith']
  setState: Store<State>['setState']
  subscribeConnectors(listener: (connectors: readonly Connector[]) => void): () => void
  subscribeChains(listener: (chains: readonly ChainDescriptor[]) => void): () => void
  getConnector(id: string): Connector | undefined
  /** Connectors that talk to one ecosystem. */
  getConnectors(namespace: ChainNamespace): readonly Connector[]
  getTransport(chainId: number): Transport
  /** EVM chain by numeric id. */
  getChain(chainId: number): Chain | undefined
  /** Any chain, in any namespace. */
  getChainDescriptor(namespace: ChainNamespace, chainId: ChainId): ChainDescriptor | undefined
  getChainByCaip2(caip2: string): ChainDescriptor | undefined
  /** Chains belonging to one ecosystem. */
  getChains(namespace: ChainNamespace): readonly ChainDescriptor[]
  /** Namespaces that have at least one chain and one connector. */
  getNamespaces(): readonly ChainNamespace[]
  addChain(chain: Chain, options?: { transport?: Transport }): void
  addChainDescriptor(chain: ChainDescriptor): void
  /** Restore previous sessions, one per namespace, where still authorized. */
  reconnect(): Promise<void>
  destroy(): void
  _internal: {
    recentConnectorKey(namespace: ChainNamespace): string
    registerConnector(connector: Connector): Connector
    setConnection(namespace: ChainNamespace, connection: Connection | undefined): void
    setPending(namespace: ChainNamespace, connectorId: string | undefined): void
    setStatus(namespace: ChainNamespace, status: ConnectionStatus): void
    setError(namespace: ChainNamespace, error: Error | undefined): void
    /**
     * The three connect phases, each a single store write. Splitting them into
     * separate `setState` calls would wake every subscriber two or three times
     * per connect and briefly publish inconsistent state.
     */
    beginConnect(namespace: ChainNamespace, connectorId: string): void
    completeConnect(namespace: ChainNamespace, connection: Connection): void
    failConnect(namespace: ChainNamespace, error: Error | undefined): void
  }
}

export function createConfig(parameters: CreateConfigParameters): Config {
  const {
    ssr = false,
    multiInjectedProviderDiscovery = true,
    autoReconnect = true,
  } = parameters

  // One mutable array shared with every connector, so `addChain` is visible to
  // them without re-creating anything.
  const chains: [Chain, ...Chain[]] = [...parameters.chains]
  const allChains: ChainDescriptor[] = [
    ...chains.map(fromViemChain),
    ...(parameters.otherChains ?? []),
  ]
  const transports: Partial<Record<number, Transport>> = { ...parameters.transports }

  const isBrowser = typeof window !== 'undefined' && !ssr
  const storage =
    parameters.storage === null ? noopStorage() : (parameters.storage ?? createStorage())

  const store = createStore<State>({
    connections: {},
    pending: {},
    statuses: {},
    chainIds: { eip155: chains[0].id },
    errors: {},
  })

  const connectors: Connector[] = []
  const connectorListeners = new Set<(connectors: readonly Connector[]) => void>()
  const chainListeners = new Set<(chains: readonly ChainDescriptor[]) => void>()
  const cleanups: Array<() => void> = []
  let destroyed = false

  const recentKey = (namespace: ChainNamespace) => `${RECENT_CONNECTOR_PREFIX}.${namespace}`

  function patch<key extends keyof State>(
    field: key,
    namespace: ChainNamespace,
    value: State[key][ChainNamespace],
  ) {
    const current = store.getState()[field]
    const next = { ...current }
    if (value === undefined) delete next[namespace]
    else next[namespace] = value as never
    store.setState({ [field]: next } as Partial<State>)
  }

  function isCurrent(connector: Connector) {
    const state = store.getState()
    return (
      state.connections[connector.namespace]?.connectorId === connector.id ||
      state.pending[connector.namespace] === connector.id
    )
  }

  function clearNamespace(namespace: ChainNamespace) {
    storage.removeItem(recentKey(namespace))
    const state = store.getState()
    const connections = { ...state.connections }
    const statuses = { ...state.statuses }
    const pending = { ...state.pending }
    delete connections[namespace]
    delete pending[namespace]
    statuses[namespace] = 'disconnected'
    store.setState({ connections, statuses, pending })
  }

  function registerConnector(connector: Connector): Connector {
    const existing = connectors.find(
      (candidate) =>
        candidate.id === connector.id ||
        (!!connector.rdns &&
          candidate.rdns === connector.rdns &&
          candidate.namespace === connector.namespace),
    )
    if (existing) return existing

    const off: Array<() => void> = [
      connector.emitter.on('change', (payload: ConnectorEventMap['change']) => {
        if (!isCurrent(connector)) return
        const connection = store.getState().connections[connector.namespace]
        if (!connection) return

        if (payload.accounts) {
          if (payload.accounts.length === 0) {
            // Wallets report a revoked session as an empty accounts array.
            clearNamespace(connector.namespace)
            return
          }
          if (!deepEqualAccounts(connection.accounts, payload.accounts)) {
            patch('connections', connector.namespace, {
              ...connection,
              accounts: payload.accounts,
              address: payload.accounts[0]!,
            })
            return
          }
        }
        if (payload.chainId !== undefined && payload.chainId !== connection.chainId) {
          patch('connections', connector.namespace, {
            ...connection,
            chainId: payload.chainId,
            caip2: toCaip2(connector.namespace, payload.chainId),
          })
          patch('chainIds', connector.namespace, payload.chainId)
        }
      }),
      connector.emitter.on('disconnect', () => {
        if (!isCurrent(connector)) return
        clearNamespace(connector.namespace)
      }),
      connector.emitter.on('connect', (payload: ConnectorEventMap['connect']) => {
        if (!isCurrent(connector)) return
        patch('connections', connector.namespace, {
          namespace: connector.namespace,
          connectorId: connector.id,
          accounts: payload.accounts,
          address: payload.accounts[0]!,
          chainId: payload.chainId,
          caip2: toCaip2(connector.namespace, payload.chainId),
        })
        patch('statuses', connector.namespace, 'connected')
      }),
      connector.emitter.on('error', ({ error }: ConnectorEventMap['error']) => {
        if (!isCurrent(connector)) return
        patch('errors', connector.namespace, toError(error))
      }),
    ]
    cleanups.push(() => off.forEach((fn) => fn()))

    connectors.push(connector)
    void connector.setup?.()
    return connector
  }

  for (const createConnector of parameters.connectors ?? []) {
    registerConnector(
      createConnector({ chains, allChains, emitter: createEmitter(), storage }),
    )
  }

  async function reconnectNamespace(namespace: ChainNamespace) {
    const id = storage.getItem(recentKey(namespace))
    if (!id) return
    const connector = connectors.find(
      (candidate) => candidate.id === id && candidate.namespace === namespace,
    )
    if (!connector) return
    if (store.getState().connections[namespace]) return

    patch('statuses', namespace, 'reconnecting')
    try {
      if (!(await connector.isAuthorized())) {
        clearNamespace(namespace)
        return
      }
      const { accounts, chainId } = await connector.connect({ isReconnecting: true })
      if (destroyed) return
      patch('connections', namespace, {
        namespace,
        connectorId: connector.id,
        accounts,
        address: accounts[0]!,
        chainId,
        caip2: toCaip2(namespace, chainId),
      })
      patch('statuses', namespace, 'connected')
      patch('chainIds', namespace, chainId)
    } catch {
      // A failed silent reconnect is not an error the user needs to see.
      clearNamespace(namespace)
    }
  }

  const config: Config = {
    chains,
    get allChains() {
      return allChains as readonly ChainDescriptor[]
    },
    get connectors() {
      return connectors as readonly Connector[]
    },
    get state() {
      return store.getState()
    },
    storage,
    store,
    subscribe: (listener) => store.subscribe(listener),
    subscribeWith: (selector, listener, options) =>
      store.subscribeWith(selector, listener, options),
    setState: (partial) => store.setState(partial),
    subscribeConnectors(listener) {
      connectorListeners.add(listener)
      return () => void connectorListeners.delete(listener)
    },
    subscribeChains(listener) {
      chainListeners.add(listener)
      return () => void chainListeners.delete(listener)
    },
    getConnector: (id) => connectors.find((connector) => connector.id === id),
    getConnectors: (namespace) =>
      connectors.filter((connector) => connector.namespace === namespace),
    getTransport: (chainId) => transports[chainId] ?? http(),
    getChain: (chainId) => chains.find((chain) => chain.id === chainId),
    getChainDescriptor: (namespace, chainId) =>
      allChains.find(
        (chain) => chain.namespace === namespace && chain.reference === String(chainId),
      ),
    getChainByCaip2: (caip2) => allChains.find((chain) => chain.caip2 === (caip2 as Caip2)),
    getChains: (namespace) => allChains.filter((chain) => chain.namespace === namespace),
    getNamespaces() {
      const seen = new Set<ChainNamespace>()
      for (const connector of connectors)
        if (allChains.some((chain) => chain.namespace === connector.namespace))
          seen.add(connector.namespace)
      return [...seen]
    },
    addChain(chain, options) {
      if (options?.transport) transports[chain.id] = options.transport
      if (chains.some((candidate) => candidate.id === chain.id)) return
      chains.push(chain)
      allChains.push(fromViemChain(chain))
      notifyChains()
    },
    addChainDescriptor(chain) {
      if (allChains.some((candidate) => candidate.caip2 === chain.caip2)) return
      allChains.push(chain)
      notifyChains()
    },
    async reconnect() {
      if (destroyed) return
      await Promise.all(
        [...new Set(connectors.map((connector) => connector.namespace))].map(reconnectNamespace),
      )
    },
    destroy() {
      destroyed = true
      cleanups.forEach((fn) => fn())
      cleanups.length = 0
      connectorListeners.clear()
      chainListeners.clear()
    },
    _internal: {
      recentConnectorKey: recentKey,
      registerConnector(connector) {
        const registered = registerConnector(connector)
        if (registered === connector) notifyConnectors()
        return registered
      },
      setConnection: (namespace, connection) => patch('connections', namespace, connection),
      setPending: (namespace, connectorId) => patch('pending', namespace, connectorId),
      beginConnect(namespace, connectorId) {
        store.setState((state) => {
          const errors = { ...state.errors }
          delete errors[namespace]
          return {
            statuses: { ...state.statuses, [namespace]: 'connecting' },
            pending: { ...state.pending, [namespace]: connectorId },
            errors,
          }
        })
      },
      completeConnect(namespace, connection) {
        store.setState((state) => {
          const pending = { ...state.pending }
          delete pending[namespace]
          return {
            connections: { ...state.connections, [namespace]: connection },
            statuses: { ...state.statuses, [namespace]: 'connected' },
            chainIds: { ...state.chainIds, [namespace]: connection.chainId },
            pending,
          }
        })
      },
      failConnect(namespace, error) {
        store.setState((state) => {
          const connections = { ...state.connections }
          const pending = { ...state.pending }
          delete connections[namespace]
          delete pending[namespace]
          return {
            connections,
            pending,
            statuses: { ...state.statuses, [namespace]: 'disconnected' },
            errors: { ...state.errors, [namespace]: error },
          }
        })
      },
      setStatus: (namespace, status) => patch('statuses', namespace, status),
      setError: (namespace, error) => patch('errors', namespace, error),
    },
  }

  function notifyConnectors() {
    const snapshot = [...connectors]
    for (const listener of [...connectorListeners]) listener(snapshot)
  }

  function notifyChains() {
    const snapshot = [...allChains]
    for (const listener of [...chainListeners]) listener(snapshot)
  }

  if (isBrowser && multiInjectedProviderDiscovery) {
    void import('./connectors/eip6963.js').then(({ startEip6963Discovery }) => {
      if (destroyed) return
      cleanups.push(startEip6963Discovery(config))
    })
  }

  const wantsSolana =
    parameters.walletStandardDiscovery ??
    allChains.some((chain) => chain.namespace === 'solana')

  if (isBrowser && wantsSolana) {
    void import('./connectors/solana.js').then(({ solana, startWalletStandardDiscovery }) => {
      if (destroyed) return
      cleanups.push(
        startWalletStandardDiscovery((wallet) => {
          config._internal.registerConnector(
            solana({ wallet })({
              chains,
              allChains,
              emitter: createEmitter(),
              storage,
            }),
          )
        }),
      )
    })
  }

  if (isBrowser && autoReconnect) {
    // Deferred so callers can subscribe before the first state transition.
    queueMicrotask(() => void config.reconnect())
  }

  return config
}
