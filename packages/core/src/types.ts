import type { Address, Chain, EIP1193Provider, Transport } from 'viem'

import type { Caip2, ChainDescriptor, ChainNamespace } from './caip.js'

export type { Address, Chain, EIP1193Provider, Transport }

/**
 * A chain's identifier within its namespace: the numeric chain id on EVM, and
 * the CAIP-2 reference (a truncated genesis hash) on Solana and Bitcoin.
 */
export type ChainId = number | string

/** Lifecycle of the active connection. */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'reconnecting'
  | 'connected'

/** One live connection, to one ecosystem. */
export type Connection = {
  namespace: ChainNamespace
  /** `id` of the connector backing this connection. */
  connectorId: string
  /** The selected account. Always `accounts[0]`. */
  address: string
  /** Every account the wallet exposed, in wallet-defined order. */
  accounts: readonly string[]
  /** Chain the wallet is on. May be a chain that is not in the config. */
  chainId: ChainId
  caip2: Caip2
}

/**
 * The single source of truth held by {@link Config.store}.
 *
 * Connections are keyed by namespace because they are independent: connecting
 * a Solana wallet must not evict an EVM one, which is exactly what multi-chain
 * dApps need.
 */
export type State = {
  connections: Partial<Record<ChainNamespace, Connection>>
  /**
   * Connector id mid-handshake, per namespace. Kept apart from `connections`
   * so a half-finished connect never surfaces an empty address to consumers,
   * while still letting the config attribute the wallet's events.
   */
  pending: Partial<Record<ChainNamespace, string>>
  statuses: Partial<Record<ChainNamespace, ConnectionStatus>>
  /** Chain selected per namespace, including while disconnected. */
  chainIds: Partial<Record<ChainNamespace, ChainId>>
  /** Last connection error per namespace, cleared on the next success. */
  errors: Partial<Record<ChainNamespace, Error>>
}

/** Events a connector pushes up into the config store. */
export type ConnectorEventMap = {
  change: { accounts?: readonly string[]; chainId?: ChainId }
  connect: { accounts: readonly string[]; chainId: ChainId }
  disconnect: undefined
  /**
   * Out-of-band messages. `display_uri` carries a WalletConnect pairing URI
   * and is what the modal renders as a QR code.
   */
  message: { type: 'display_uri' | (string & {}); data?: unknown }
  error: { error: Error }
}

export type ConnectorEmitter = {
  emit<K extends keyof ConnectorEventMap>(event: K, payload: ConnectorEventMap[K]): void
  on<K extends keyof ConnectorEventMap>(
    event: K,
    listener: (payload: ConnectorEventMap[K]) => void,
  ): () => void
  off<K extends keyof ConnectorEventMap>(
    event: K,
    listener: (payload: ConnectorEventMap[K]) => void,
  ): void
}

export type ConnectorType = 'injected' | 'walletConnect' | 'coinbase' | (string & {})

/**
 * Who the user is actually connected through. For an EIP-6963 wallet this is
 * the wallet's own announcement; over WalletConnect it is the peer metadata
 * the wallet sent with the session, so you learn it is Rainbow or Trust rather
 * than just "WalletConnect".
 */
export type WalletInfo = {
  name: string
  /** Data URI or https URL supplied by the wallet itself. */
  icon?: string
  rdns?: string
  url?: string
}

/** Result of a successful {@link Connector.connect}. */
export type ConnectResult = {
  accounts: readonly string[]
  chainId: ChainId
}

/**
 * A wallet integration. Connectors are created by a {@link CreateConnectorFn}
 * so that they receive the chain list, storage and emitter from the config.
 */
export type Connector = {
  readonly id: string
  readonly name: string
  /** Ecosystem this connector talks to. Defaults to `eip155` when omitted. */
  readonly namespace: ChainNamespace
  readonly type: ConnectorType
  /** Data URI or https URL. Rendered by the modal. */
  readonly icon?: string
  /** Reverse-DNS identifier when the connector came from EIP-6963 discovery. */
  readonly rdns?: string
  /** Deep link / install page, shown when the wallet is not detected. */
  readonly downloadUrl?: string

  emitter: ConnectorEmitter

  /** Called once when the config is created. Attach long-lived listeners here. */
  setup?(): Promise<void>
  connect(parameters?: { chainId?: ChainId; isReconnecting?: boolean }): Promise<ConnectResult>
  disconnect(): Promise<void>
  getAccounts(): Promise<readonly string[]>
  getChainId(): Promise<ChainId>
  /**
   * The wallet's underlying provider. An `EIP1193Provider` for `eip155`; each
   * non-EVM namespace has its own shape, so callers narrow it themselves.
   */
  getProvider(parameters?: { chainId?: ChainId }): Promise<unknown>
  /** `true` when the wallet already granted access and `connect` can run silently. */
  isAuthorized(): Promise<boolean>
  switchChain?(parameters: { chainId: ChainId }): Promise<ChainDescriptor>
  /** `false` when the wallet is not installed. The modal shows an install link instead. */
  isAvailable?(): boolean
  /**
   * Identity of the wallet actually on the other end of this connection, when
   * the connector can learn more than its own static `name` and `icon`.
   * Resolve after connecting; before that it may return `undefined`.
   */
  getWalletInfo?(): Promise<WalletInfo | undefined>
}

export type CreateConnectorFn = (parameters: {
  /** EVM chains from the config. Empty for connectors in other namespaces. */
  chains: readonly Chain[]
  /** Every chain in the config, whatever its namespace. */
  allChains: readonly ChainDescriptor[]
  emitter: ConnectorEmitter
  storage?: Storage
}) => Connector

/** Sync-or-async key/value store used to persist the last connector. */
export type Storage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
