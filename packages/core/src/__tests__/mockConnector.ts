import {
  bitcoinMainnet,
  fromViemChain,
  solanaMainnet,
  type ChainNamespace,
} from '../caip.js'
import type { Address, ConnectResult, CreateConnectorFn } from '../types.js'

export type MockConnectorParameters = {
  id?: string
  namespace?: ChainNamespace
  name?: string
  accounts?: readonly Address[]
  chainId?: number | string
  /** Reject `connect` with this error, simulating a user rejection. */
  failConnect?: Error
  /** Start out already authorized, as a wallet that remembers the dApp would. */
  authorized?: boolean
}

export type MockConnectorHandle = {
  /** Push an `accountsChanged`-style event up into the config. */
  emitAccountsChanged(accounts: readonly Address[]): void
  emitChainChanged(chainId: number | string): void
  emitDisconnect(): void
  emitDisplayUri(uri: string): void
  readonly connectCalls: number
  readonly disconnectCalls: number
}

/** In-memory connector used by the core test-suite. */
export function mockConnector(parameters: MockConnectorParameters = {}): {
  create: CreateConnectorFn
  handle: MockConnectorHandle
} {
  const id = parameters.id ?? 'mock'
  const namespace: ChainNamespace = parameters.namespace ?? 'eip155'
  let accounts = parameters.accounts ?? ['0x0000000000000000000000000000000000000001']
  // Each ecosystem identifies chains differently; default to that
  // namespace's mainnet rather than pretending everything is chain 1.
  let chainId: number | string =
    parameters.chainId ??
    (namespace === 'solana'
      ? solanaMainnet.reference
      : namespace === 'bip122'
        ? bitcoinMainnet.reference
        : 1)
  let authorized = parameters.authorized ?? false
  let connectCalls = 0
  let disconnectCalls = 0

  const handle: MockConnectorHandle = {
    emitAccountsChanged: () => {},
    emitChainChanged: () => {},
    emitDisconnect: () => {},
    emitDisplayUri: () => {},
    get connectCalls() {
      return connectCalls
    },
    get disconnectCalls() {
      return disconnectCalls
    },
  }

  const create: CreateConnectorFn = ({ emitter, chains }) => {
    handle.emitAccountsChanged = (next) => {
      accounts = next
      emitter.emit('change', { accounts: next })
    }
    handle.emitChainChanged = (next) => {
      chainId = next
      emitter.emit('change', { chainId: next })
    }
    handle.emitDisconnect = () => emitter.emit('disconnect', undefined)
    handle.emitDisplayUri = (uri) => emitter.emit('message', { type: 'display_uri', data: uri })

    return {
      id,
      namespace,
      name: parameters.name ?? 'Mock Wallet',
      type: 'injected',
      emitter,
      isAvailable: () => true,
      async connect(options): Promise<ConnectResult> {
        connectCalls++
        if (parameters.failConnect) throw parameters.failConnect
        authorized = true
        if (options?.chainId !== undefined)
          chainId = namespace === 'eip155' ? Number(options.chainId) : options.chainId
        return { accounts, chainId }
      },
      async disconnect() {
        disconnectCalls++
        authorized = false
      },
      async getAccounts() {
        return accounts
      },
      async getChainId() {
        return chainId
      },
      async getProvider() {
        return undefined
      },
      async isAuthorized() {
        return authorized
      },
      async switchChain({ chainId: next }) {
        const chain = chains.find((candidate) => candidate.id === Number(next))
        if (!chain) throw new Error(`unknown chain ${next}`)
        chainId = Number(next)
        return fromViemChain(chain)
      },
    }
  }

  return { create, handle }
}
