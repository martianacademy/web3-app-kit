import { fromViemChain, type ChainDescriptor, type ChainNamespace } from '../caip.js'
import type { Config } from '../config.js'
import {
  ChainNotConfiguredError,
  NotConnectedError,
  SwitchChainNotSupportedError,
} from '../errors.js'
import type { ChainId } from '../types.js'

export type SwitchChainParameters = {
  chainId: ChainId
  /** Which ecosystem the chain belongs to. Defaults to `eip155`. */
  namespace?: ChainNamespace
}

export async function switchChain(
  config: Config,
  parameters: SwitchChainParameters,
): Promise<ChainDescriptor> {
  const namespace = parameters.namespace ?? 'eip155'
  const chain = config.getChainDescriptor(namespace, parameters.chainId)
  if (!chain) throw new ChainNotConfiguredError(parameters.chainId)

  const connection = config.state.connections[namespace]
  if (!connection) {
    // Not connected: switching is a local preference only.
    config.setState((state) => ({
      chainIds: { ...state.chainIds, [namespace]: parameters.chainId },
    }))
    return chain
  }

  const connector = config.getConnector(connection.connectorId)
  if (!connector) throw new NotConnectedError()
  if (!connector.switchChain) throw new SwitchChainNotSupportedError(connector.name)

  const result = await connector.switchChain({ chainId: parameters.chainId })
  config._internal.setConnection(namespace, {
    ...connection,
    chainId: result.reference,
    caip2: result.caip2,
  })
  config.setState((state) => ({
    chainIds: { ...state.chainIds, [namespace]: result.reference },
  }))
  return result
}

/** Convenience for the common EVM case: returns the viem chain. */
export { fromViemChain }
