import type { Chain } from 'viem'

import type { ChainDescriptor, ChainNamespace } from '../caip.js'
import type { Config } from '../config.js'
import type {
  Address,
  ChainId,
  ConnectionStatus,
  Connector,
  WalletInfo,
} from '../types.js'

export type GetAccountParameters = {
  /** Which ecosystem to read. Defaults to `eip155`. */
  namespace?: ChainNamespace
}

export type GetAccountReturnType = {
  namespace: ChainNamespace
  /**
   * The selected account. Typed as an EVM address for convenience — on Solana
   * and Bitcoin it is that namespace's address format, not a `0x` string.
   */
  address: Address | undefined
  addresses: readonly string[]
  /** The EVM chain, when this namespace is `eip155`. */
  chain: Chain | undefined
  /** The chain in any namespace. */
  chainDescriptor: ChainDescriptor | undefined
  chainId: ChainId | undefined
  connector: Connector | undefined
  status: ConnectionStatus
  isConnected: boolean
  isConnecting: boolean
  isReconnecting: boolean
  isDisconnected: boolean
}

/**
 * Shared so a disconnected snapshot is referentially stable. Returning a fresh
 * `[]` each call makes every equality check fail, which sends
 * `useSyncExternalStore` into an infinite render loop.
 */
const NO_ACCOUNTS: readonly string[] = Object.freeze([])

export function getAccount(
  config: Config,
  parameters: GetAccountParameters = {},
): GetAccountReturnType {
  const namespace = parameters.namespace ?? 'eip155'
  const state = config.state
  const connection = state.connections[namespace]
  const status = state.statuses[namespace] ?? 'disconnected'
  const chainId = connection?.chainId ?? state.chainIds[namespace]

  return {
    namespace,
    address: connection?.address as Address | undefined,
    addresses: connection?.accounts ?? NO_ACCOUNTS,
    chainId,
    chain:
      namespace === 'eip155' && chainId !== undefined
        ? config.getChain(Number(chainId))
        : undefined,
    chainDescriptor:
      chainId !== undefined ? config.getChainDescriptor(namespace, chainId) : undefined,
    connector: connection ? config.getConnector(connection.connectorId) : undefined,
    status,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    isReconnecting: status === 'reconnecting',
    isDisconnected: status === 'disconnected',
  }
}

/** Every namespace that currently has a connection. */
export function getConnections(config: Config): readonly GetAccountReturnType[] {
  return (Object.keys(config.state.connections) as ChainNamespace[]).map((namespace) =>
    getAccount(config, { namespace }),
  )
}

/**
 * Fires whenever the connected account, chain or status changes.
 * Identity-stable: it will not fire for unrelated state writes.
 */
export function watchAccount(
  config: Config,
  onChange: (account: GetAccountReturnType, previous: GetAccountReturnType) => void,
  parameters: GetAccountParameters = {},
): () => void {
  const namespace = parameters.namespace ?? 'eip155'
  const key = (account: GetAccountReturnType) =>
    `${account.status}|${account.address ?? ''}|${account.chainId ?? ''}|${account.connector?.id ?? ''}|${account.addresses.length}`

  let previous = getAccount(config, { namespace })
  let previousKey = key(previous)

  return config.subscribe(() => {
    const next = getAccount(config, { namespace })
    const nextKey = key(next)
    if (nextKey === previousKey) return
    const before = previous
    previous = next
    previousKey = nextKey
    onChange(next, before)
  })
}

export function getChainId(config: Config, parameters: GetAccountParameters = {}): number {
  const namespace = parameters.namespace ?? 'eip155'
  const chainId = config.state.connections[namespace]?.chainId ?? config.state.chainIds[namespace]
  return chainId === undefined ? config.chains[0].id : Number(chainId)
}

export function watchChainId(
  config: Config,
  onChange: (chainId: number) => void,
  parameters: GetAccountParameters = {},
): () => void {
  let previous = getChainId(config, parameters)
  return config.subscribe(() => {
    const next = getChainId(config, parameters)
    if (next === previous) return
    previous = next
    onChange(next)
  })
}

/**
 * Which wallet is on the other end — the name and logo the wallet itself
 * supplies, rather than the connector's generic label.
 */
export async function getWalletInfo(
  config: Config,
  parameters: GetAccountParameters = {},
): Promise<WalletInfo | undefined> {
  const namespace = parameters.namespace ?? 'eip155'
  const connection = config.state.connections[namespace]
  if (!connection) return undefined

  const connector = config.getConnector(connection.connectorId)
  if (!connector) return undefined

  const info = await connector.getWalletInfo?.().catch(() => undefined)
  return info ?? { name: connector.name, icon: connector.icon, rdns: connector.rdns }
}
