import type { ChainNamespace } from '../caip.js'
import { toCaip2 } from '../caip.js'
import type { Config } from '../config.js'
import { createEmitter } from '../emitter.js'
import { ConnectorNotFoundError, toError } from '../errors.js'
import type { ChainId, Connector, CreateConnectorFn } from '../types.js'

export type ConnectParameters = {
  /** A registered connector, its `id`, or a factory to register on the fly. */
  connector: Connector | CreateConnectorFn | string
  /** Ask the wallet to move to this chain as part of connecting. */
  chainId?: ChainId
}

export type ConnectReturnType = {
  accounts: readonly string[]
  chainId: ChainId
  namespace: ChainNamespace
  connector: Connector
}

/** Resolves the many shapes a caller may pass into a registered `Connector`. */
export function resolveConnector(
  config: Config,
  connector: Connector | CreateConnectorFn | string,
): Connector {
  if (typeof connector === 'string') {
    const found = config.getConnector(connector)
    if (!found) throw new ConnectorNotFoundError(connector)
    return found
  }
  if (typeof connector === 'function')
    return config._internal.registerConnector(
      connector({
        chains: config.chains,
        allChains: config.allChains,
        emitter: createEmitter(),
        storage: config.storage,
      }),
    )
  return config._internal.registerConnector(connector)
}

/**
 * Connects one wallet. Namespaces are independent: connecting a Solana wallet
 * leaves an existing EVM connection alone, and vice versa.
 */
export async function connect(
  config: Config,
  parameters: ConnectParameters,
): Promise<ConnectReturnType> {
  const connector = resolveConnector(config, parameters.connector)
  const namespace = connector.namespace

  // Claims the namespace so the wallet's events during the handshake (chain
  // switches, account prompts) are attributed to this attempt, without
  // publishing a half-built connection that consumers would render.
  config._internal.beginConnect(namespace, connector.id)

  try {
    const { accounts, chainId } = await connector.connect({ chainId: parameters.chainId })
    if (accounts.length === 0) throw new Error(`${connector.name} returned no accounts.`)

    config.storage.setItem(config._internal.recentConnectorKey(namespace), connector.id)
    config._internal.completeConnect(namespace, {
      namespace,
      connectorId: connector.id,
      accounts,
      address: accounts[0]!,
      chainId,
      caip2: toCaip2(namespace, chainId),
    })

    return { accounts, chainId, namespace, connector }
  } catch (error) {
    config._internal.failConnect(namespace, toError(error))
    throw error
  }
}
