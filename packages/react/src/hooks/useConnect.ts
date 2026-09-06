import { useCallback } from 'react'
import {
  connect,
  createEmitter,
  disconnect,
  switchChain,
  type Chain,
  type ChainDescriptor,
  type ConnectParameters,
  type ConnectReturnType,
  type Connector,
  type CreateConnectorFn,
} from '@web3-app-kit/core'

import { useConfig } from '../context.js'
import { useConnectors } from './useAccount.js'
import { useMutation, type Mutation } from '../internal.js'

export type UseConnectReturnType = Mutation<ConnectParameters, ConnectReturnType> & {
  connect: (parameters: ConnectParameters) => void
  connectAsync: (parameters: ConnectParameters) => Promise<ConnectReturnType>
  connectors: readonly Connector[]
}

/**
 * Connect through a specific connector. For the built-in modal use
 * {@link useAppKit} instead.
 */
export function useConnect(): UseConnectReturnType {
  const config = useConfig()
  const connectors = useConnectors()
  const mutation = useMutation<ConnectParameters, ConnectReturnType>(
    useCallback((parameters) => connect(config, parameters), [config]),
  )

  return {
    ...mutation,
    connect: mutation.mutate,
    connectAsync: mutation.mutateAsync,
    connectors,
  }
}

export type UseDisconnectReturnType = Mutation<
  { connector?: Connector | string } | undefined,
  void
> & {
  disconnect: (parameters?: { connector?: Connector | string }) => void
  disconnectAsync: (parameters?: { connector?: Connector | string }) => Promise<void>
}

export function useDisconnect(): UseDisconnectReturnType {
  const config = useConfig()
  const mutation = useMutation<{ connector?: Connector | string } | undefined, void>(
    useCallback((parameters) => disconnect(config, parameters ?? {}), [config]),
  )

  return {
    ...mutation,
    disconnect: mutation.mutate,
    disconnectAsync: mutation.mutateAsync,
  }
}

export type UseSwitchChainReturnType = Mutation<{ chainId: number }, ChainDescriptor> & {
  switchChain: (parameters: { chainId: number }) => void
  switchChainAsync: (parameters: { chainId: number }) => Promise<ChainDescriptor>
  chains: readonly Chain[]
}

export function useSwitchChain(): UseSwitchChainReturnType {
  const config = useConfig()
  const mutation = useMutation<{ chainId: number }, ChainDescriptor>(
    useCallback((parameters) => switchChain(config, parameters), [config]),
  )

  return {
    ...mutation,
    switchChain: mutation.mutate,
    switchChainAsync: mutation.mutateAsync,
    chains: config.chains,
  }
}

/** Registers a connector at runtime, e.g. one created from user input. */
export function useRegisterConnector(): (connector: CreateConnectorFn) => Connector {
  const config = useConfig()
  return useCallback(
    (createConnector: CreateConnectorFn) =>
      config._internal.registerConnector(
        createConnector({
          chains: config.chains,
          allChains: config.allChains,
          emitter: createEmitter(),
          storage: config.storage,
        }),
      ),
    [config],
  )
}
