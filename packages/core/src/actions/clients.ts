import {
  createPublicClient,
  createWalletClient,
  custom,
  type Chain,
  type PublicClient,
  type WalletClient,
} from 'viem'

import type { Config } from '../config.js'
import { ChainNotConfiguredError, NotConnectedError, ProviderNotFoundError } from '../errors.js'
import type { Address, EIP1193Provider } from '../types.js'

const publicClientCache = new WeakMap<Config, Map<number, PublicClient>>()

/** Read-only viem client for `chainId` (defaults to the active chain). */
export function getPublicClient(
  config: Config,
  parameters: { chainId?: number } = {},
): PublicClient {
  const chainId =
    parameters.chainId ?? Number(config.state.chainIds.eip155 ?? config.chains[0].id)
  const chain = config.getChain(chainId)
  if (!chain) throw new ChainNotConfiguredError(chainId)

  let cache = publicClientCache.get(config)
  if (!cache) {
    cache = new Map()
    publicClientCache.set(config, cache)
  }
  const cached = cache.get(chainId)
  if (cached) return cached

  const client = createPublicClient({
    chain,
    transport: config.getTransport(chainId),
  })
  cache.set(chainId, client)
  return client
}

/**
 * Signing client backed by the connected wallet's EIP-1193 provider.
 * Not cached: the underlying provider can be swapped by the wallet at any time.
 */
export async function getWalletClient(
  config: Config,
  parameters: { chainId?: number; account?: Address } = {},
): Promise<WalletClient> {
  // EVM only: a viem wallet client needs an EIP-1193 provider, which is not
  // what the Solana or Bitcoin connectors hand back.
  const connection = config.state.connections.eip155
  if (!connection) throw new NotConnectedError()

  const connector = config.getConnector(connection.connectorId)
  if (!connector) throw new NotConnectedError()

  const chainId = parameters.chainId ?? Number(connection.chainId)
  const provider = (await connector.getProvider({ chainId })) as EIP1193Provider | undefined
  if (!provider) throw new ProviderNotFoundError(connector.name)

  const account = parameters.account ?? (connection.address as Address)
  if (!account) throw new NotConnectedError()

  const chain: Chain | undefined = config.getChain(chainId)

  return createWalletClient({
    account,
    chain,
    transport: custom(provider),
  })
}
