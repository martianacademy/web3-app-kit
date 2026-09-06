import type { EIP1193Provider } from 'viem'

import { fromViemChain, type ChainDescriptor } from '../caip.js'

import {
  ChainNotConfiguredError,
  ProviderNotFoundError,
  UserRejectedRequestError,
  isUserRejectedError,
  toError,
} from '../errors.js'
import type { ConnectResult, Connector, CreateConnectorFn, WalletInfo } from '../types.js'
import { normalizeChainId, toHexChainId, uniqueAddresses } from '../utils.js'

export type CoinbaseWalletParameters = {
  /** Shown in the Coinbase Wallet connection prompt. */
  appName?: string
  appLogoUrl?: string
  /**
   * `all` offers both the extension and the smart wallet, `smartWalletOnly`
   * forces the passkey-based smart wallet, `eoaOnly` forces the extension.
   */
  preference?: 'all' | 'smartWalletOnly' | 'eoaOnly'
}

/**
 * Coinbase Wallet (extension, mobile and Smart Wallet) via
 * `@coinbase/wallet-sdk`, loaded lazily on first use.
 */
export function coinbaseWallet(parameters: CoinbaseWalletParameters = {}): CreateConnectorFn {
  return ({ chains, emitter }) => {
    let provider: EIP1193Provider | undefined
    let initPromise: Promise<EIP1193Provider> | undefined
    let listenersAttached = false

    const onAccountsChanged = (accounts: unknown) => {
      const list = uniqueAddresses((accounts as string[]) ?? [])
      if (list.length === 0) emitter.emit('disconnect', undefined)
      else emitter.emit('change', { accounts: list })
    }
    const onChainChanged = (chainId: unknown) => {
      emitter.emit('change', { chainId: normalizeChainId(chainId as string) })
    }
    const onDisconnect = () => emitter.emit('disconnect', undefined)

    async function initProvider(): Promise<EIP1193Provider> {
      if (provider) return provider
      if (initPromise) return initPromise

      initPromise = (async () => {
        const { createCoinbaseWalletSDK } = await import('@coinbase/wallet-sdk')
        const sdk = createCoinbaseWalletSDK({
          appName: parameters.appName ?? inferAppName(),
          appLogoUrl: parameters.appLogoUrl,
          appChainIds: chains.map((chain) => chain.id),
          preference: { options: parameters.preference ?? 'all' },
        })
        const created = sdk.getProvider() as unknown as EIP1193Provider
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

    function attach(instance: EIP1193Provider) {
      if (listenersAttached) return
      listenersAttached = true
      instance.on('accountsChanged', onAccountsChanged)
      instance.on('chainChanged', onChainChanged)
      instance.on('disconnect', onDisconnect)
    }

    const connector: Connector = {
      id: 'coinbaseWallet',
      namespace: 'eip155',
      name: 'Coinbase Wallet',
      type: 'coinbase',
      emitter,
      isAvailable: () => true,

      async connect({ chainId, isReconnecting } = {}): Promise<ConnectResult> {
        const instance = await initProvider()
        try {
          const accounts = uniqueAddresses(
            (await instance.request({
              method: isReconnecting ? 'eth_accounts' : 'eth_requestAccounts',
            })) as string[],
          )
          if (accounts.length === 0) throw new ProviderNotFoundError('Coinbase Wallet')

          let currentChainId = normalizeChainId(
            await instance.request({ method: 'eth_chainId' }),
          )
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
          await (provider as unknown as { disconnect?: () => Promise<void> })?.disconnect?.()
        } catch {
          /* best effort */
        }
        listenersAttached = false
        provider = undefined
        initPromise = undefined
      },

      async getAccounts() {
        if (!provider) return []
        return uniqueAddresses((await provider.request({ method: 'eth_accounts' })) as string[])
      },

      async getChainId() {
        const instance = await initProvider()
        return normalizeChainId(await instance.request({ method: 'eth_chainId' }))
      },

      async getProvider() {
        return initProvider()
      },

      async isAuthorized() {
        try {
          const instance = await initProvider()
          const accounts = (await instance.request({ method: 'eth_accounts' })) as string[]
          return accounts.length > 0
        } catch {
          return false
        }
      },

      async getWalletInfo(): Promise<WalletInfo | undefined> {
        return { name: connector.name, rdns: 'com.coinbase.wallet' }
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

function inferAppName(): string {
  if (typeof document === 'undefined') return 'dApp'
  return document.title || 'dApp'
}
