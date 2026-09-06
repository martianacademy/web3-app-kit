import type { ChainNamespace } from '../caip.js'
import type { Config } from '../config.js'
import type { Connector } from '../types.js'

export type DisconnectParameters = {
  /** Defaults to the connector currently connected in `namespace`. */
  connector?: Connector | string
  /** Which ecosystem to disconnect. Defaults to `eip155`. */
  namespace?: ChainNamespace
}

export async function disconnect(
  config: Config,
  parameters: DisconnectParameters = {},
): Promise<void> {
  const namespace = parameters.namespace ?? 'eip155'
  const id =
    typeof parameters.connector === 'string'
      ? parameters.connector
      : (parameters.connector?.id ?? config.state.connections[namespace]?.connectorId)

  const connector = id ? config.getConnector(id) : undefined

  try {
    await connector?.disconnect()
  } finally {
    // The user asked to disconnect; local state must clear even if the wallet
    // or relay failed to acknowledge it.
    config.storage.removeItem(config._internal.recentConnectorKey(namespace))
    config._internal.failConnect(namespace, undefined)
  }
}

/** Disconnects every namespace at once. */
export async function disconnectAll(config: Config): Promise<void> {
  const namespaces = Object.keys(config.state.connections) as ChainNamespace[]
  await Promise.all(namespaces.map((namespace) => disconnect(config, { namespace })))
}
