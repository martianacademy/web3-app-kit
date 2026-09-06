import type { EIP1193Provider } from 'viem'

import { fromViemChain, type ChainDescriptor } from '../caip.js'

import {
  ChainNotConfiguredError,
  ProviderNotFoundError,
  UserRejectedRequestError,
  Web3AppKitError,
  isUserRejectedError,
  toError,
} from '../errors.js'
import type { ConnectResult, Connector, CreateConnectorFn, WalletInfo } from '../types.js'
import { normalizeChainId, toHexChainId, uniqueAddresses } from '../utils.js'

type WalletConnectModule = typeof import('@walletconnect/ethereum-provider')
type WalletConnectProvider = Awaited<
  ReturnType<WalletConnectModule['EthereumProvider']['init']>
>

export type WalletConnectMetadata = {
  name: string
  description: string
  url: string
  icons: string[]
}

export type WalletConnectParameters = {
  /** Project id from https://dashboard.reown.com — WalletConnect relays require one. */
  projectId: string
  /** Shown to the user inside their wallet during the pairing prompt. */
  metadata?: WalletConnectMetadata
  /** Override the relay endpoint. Defaults to the public WalletConnect relay. */
  relayUrl?: string
  /** Extra RPC methods to request in the session proposal. */
  methods?: string[]
  /** Persist the session across reloads. Defaults to `true`. */
  storeSession?: boolean
}

/**
 * WalletConnect v2 via `@walletconnect/ethereum-provider`, which is loaded
 * lazily so dApps that never open the QR view do not pay for the bundle.
 *
 * The built-in WalletConnect modal is disabled: pairing URIs are emitted as
 * `message` events with `type: 'display_uri'` so this SDK's own modal renders
 * the QR code.
 */
export function walletConnect(parameters: WalletConnectParameters): CreateConnectorFn {
  if (!parameters.projectId)
    throw new Web3AppKitError('`walletConnect` requires a `projectId`.')

  return ({ chains, emitter }) => {
    let provider: WalletConnectProvider | undefined
    let initPromise: Promise<WalletConnectProvider> | undefined
    let listenersAttached = false

    async function initProvider(): Promise<WalletConnectProvider> {
      if (provider) return provider
      if (initPromise) return initPromise

      initPromise = (async () => {
        const { EthereumProvider } = await import('@walletconnect/ethereum-provider')
        const rpcMap = Object.fromEntries(
          chains.map((chain) => [chain.id, chain.rpcUrls.default.http[0] ?? '']),
        )
        const created = await EthereumProvider.init({
          projectId: parameters.projectId,
          // Requiring every chain makes wallets that only support mainnet
          // reject the proposal outright, so only the default chain is required.
          chains: [chains[0]!.id],
          optionalChains: chains.map((chain) => chain.id) as [number, ...number[]],
          rpcMap,
          showQrModal: false,
          metadata: parameters.metadata ?? inferMetadata(),
          ...(parameters.relayUrl ? { relayUrl: parameters.relayUrl } : {}),
          ...(parameters.methods ? { optionalMethods: parameters.methods } : {}),
        })
        provider = created
        attach(created)
        return created
      })()

      try {
        return await initPromise
      } catch (error) {
        initPromise = undefined
        throw toError(error)
      }
    }

    function attach(instance: WalletConnectProvider) {
      if (listenersAttached) return
      listenersAttached = true
      instance.on('display_uri', (uri: string) => {
        emitter.emit('message', { type: 'display_uri', data: uri })
      })
      instance.on('accountsChanged', (accounts: string[]) => {
        const list = uniqueAddresses(accounts ?? [])
        if (list.length === 0) emitter.emit('disconnect', undefined)
        else emitter.emit('change', { accounts: list })
      })
      instance.on('chainChanged', (chainId: string | number) => {
        emitter.emit('change', { chainId: normalizeChainId(chainId) })
      })
      instance.on('disconnect', () => {
        emitter.emit('disconnect', undefined)
      })
      instance.on('session_delete', () => {
        emitter.emit('disconnect', undefined)
      })
    }

    const connector: Connector = {
      id: 'walletConnect',
      namespace: 'eip155',
      name: 'WalletConnect',
      type: 'walletConnect',
      emitter,
      isAvailable: () => true,

      async setup() {
        // Intentionally empty: initialising eagerly would download the relay
        // client on every page load. `connect`/`isAuthorized` initialise it.
      },

      async connect({ chainId, isReconnecting } = {}): Promise<ConnectResult> {
        const instance = await initProvider()
        try {
          if (isReconnecting && !instance.session)
            throw new ProviderNotFoundError('WalletConnect session')

          const accounts = uniqueAddresses(
            instance.session ? instance.accounts : await instance.enable(),
          )
          if (accounts.length === 0) throw new ProviderNotFoundError('WalletConnect session')

          let currentChainId = normalizeChainId(instance.chainId)
          if (chainId && chainId !== currentChainId && connector.switchChain) {
            const chain = await connector.switchChain({ chainId }).catch(() => undefined)
            if (chain) currentChainId = Number(chain.reference)
          }

          return { accounts, chainId: currentChainId }
        } catch (error) {
          if (isUserRejectedError(error)) throw new UserRejectedRequestError({ cause: error })
          throw toError(error)
        }
      },

      async disconnect() {
        try {
          await provider?.disconnect()
        } catch {
          /* the session may already be gone on the relay */
        }
        listenersAttached = false
        provider = undefined
        initPromise = undefined
      },

      async getAccounts() {
        if (!provider?.session) return []
        return uniqueAddresses(provider.accounts)
      },

      async getChainId() {
        const instance = await initProvider()
        return normalizeChainId(instance.chainId)
      },

      async getProvider() {
        return (await initProvider()) as unknown as EIP1193Provider
      },

      async isAuthorized() {
        try {
          if (parameters.storeSession === false) return false
          const instance = await initProvider()
          return !!instance.session && instance.accounts.length > 0
        } catch {
          return false
        }
      },

      /**
       * The session proposal carries the wallet's own metadata, which is the
       * only way to know that "WalletConnect" is really Rainbow or Trust.
       */
      async getWalletInfo(): Promise<WalletInfo | undefined> {
        const metadata = provider?.session?.peer?.metadata
        if (!metadata?.name) return { name: connector.name }
        return {
          name: metadata.name,
          icon: metadata.icons?.[0],
          url: metadata.url,
        }
      },

      async switchChain({ chainId }): Promise<ChainDescriptor> {
        const chain = chains.find((candidate) => candidate.id === Number(chainId))
        if (!chain) throw new ChainNotConfiguredError(chainId)
        const instance = await initProvider()
        try {
          await instance.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: toHexChainId(Number(chainId)) }],
          })
          emitter.emit('change', { chainId })
          return fromViemChain(chain)
        } catch (error) {
          if (isUserRejectedError(error)) throw new UserRejectedRequestError({ cause: error })
          throw toError(error)
        }
      },
    }

    return connector
  }
}

function inferMetadata(): WalletConnectMetadata {
  if (typeof document === 'undefined' || typeof window === 'undefined')
    return { name: 'dApp', description: '', url: '', icons: [] }

  const icon =
    document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ??
    `${window.location.origin}/favicon.ico`

  return {
    name: document.title || window.location.host,
    description:
      document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '',
    url: window.location.origin,
    icons: [icon],
  }
}
