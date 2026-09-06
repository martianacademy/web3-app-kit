import type { Address, EIP1193Provider } from 'viem'

import { fromViemChain, type ChainDescriptor } from '../caip.js'

import {
  ChainNotConfiguredError,
  ProviderNotFoundError,
  UserRejectedRequestError,
  isUserRejectedError,
  toError,
} from '../errors.js'
import type { ConnectResult, Connector, CreateConnectorFn, WalletInfo } from '../types.js'
import { detectInjectedWallet } from './detect.js'
import { normalizeChainId, toHexChainId, uniqueAddresses } from '../utils.js'

export type InjectedTarget = {
  id: string
  name: string
  icon?: string
  rdns?: string
  downloadUrl?: string
  /** Resolves the EIP-1193 provider. Return `undefined` when not installed. */
  provider: () => EIP1193Provider | undefined
}

export type InjectedParameters = {
  /** Defaults to `window.ethereum`. */
  target?: InjectedTarget
  /**
   * Injected wallets have no real "disconnect". When `true` (the default) an
   * explicit disconnect is remembered so the modal does not silently
   * reconnect on the next page load.
   */
  shimDisconnect?: boolean
}

type EthereumWindow = Window & {
  ethereum?: EIP1193Provider & { providers?: EIP1193Provider[] }
}

function defaultTarget(): InjectedTarget {
  return {
    id: 'injected',
    name: 'Browser Wallet',
    provider: () => {
      if (typeof window === 'undefined') return undefined
      return (window as EthereumWindow).ethereum
    },
  }
}

/**
 * Connector for any wallet that injects an EIP-1193 provider into the page.
 * Also used as the implementation behind every EIP-6963 discovered wallet.
 */
export function injected(parameters: InjectedParameters = {}): CreateConnectorFn {
  const target = parameters.target ?? defaultTarget()
  const shimDisconnect = parameters.shimDisconnect ?? true

  return ({ chains, emitter, storage }) => {
    const disconnectedKey = `${target.id}.disconnected`
    let listenersAttached = false

    const onAccountsChanged = (accounts: unknown) => {
      const list = uniqueAddresses((accounts as string[]) ?? [])
      if (list.length === 0) emitter.emit('disconnect', undefined)
      else emitter.emit('change', { accounts: list })
    }
    const onChainChanged = (chainId: unknown) => {
      emitter.emit('change', { chainId: normalizeChainId(chainId as string) })
    }
    const onDisconnect = () => {
      emitter.emit('disconnect', undefined)
    }

    async function requireProvider(): Promise<EIP1193Provider> {
      const provider = target.provider()
      if (!provider) throw new ProviderNotFoundError(target.name)
      return provider
    }

    function attach(provider: EIP1193Provider) {
      if (listenersAttached) return
      listenersAttached = true
      provider.on('accountsChanged', onAccountsChanged)
      provider.on('chainChanged', onChainChanged)
      provider.on('disconnect', onDisconnect)
    }

    function detach(provider: EIP1193Provider | undefined) {
      if (!provider || !listenersAttached) return
      listenersAttached = false
      provider.removeListener('accountsChanged', onAccountsChanged)
      provider.removeListener('chainChanged', onChainChanged)
      provider.removeListener('disconnect', onDisconnect)
    }

    const connector: Connector = {
      id: target.id,
      namespace: 'eip155',
      name: target.name,
      type: 'injected',
      icon: target.icon,
      rdns: target.rdns,
      downloadUrl: target.downloadUrl,
      emitter,

      isAvailable: () => !!target.provider(),

      async connect({ chainId, isReconnecting } = {}): Promise<ConnectResult> {
        const provider = await requireProvider()
        try {
          const requested = (await provider.request({
            method: isReconnecting ? 'eth_accounts' : 'eth_requestAccounts',
          })) as string[]
          let accounts = uniqueAddresses(requested)
          if (accounts.length === 0 && isReconnecting)
            throw new ProviderNotFoundError(target.name)

          attach(provider)
          if (shimDisconnect) storage?.removeItem(disconnectedKey)

          let currentChainId = await connector.getChainId()
          if (chainId && chainId !== currentChainId && connector.switchChain) {
            const chain = await connector.switchChain({ chainId })
            currentChainId = Number(chain.reference)
            // Some wallets rotate the exposed account when switching chains.
            accounts = uniqueAddresses(
              (await provider.request({ method: 'eth_accounts' })) as string[],
            )
          }

          return { accounts, chainId: currentChainId }
        } catch (error) {
          if (isUserRejectedError(error)) throw new UserRejectedRequestError({ cause: error })
          throw toError(error)
        }
      },

      async disconnect() {
        const provider = target.provider()
        detach(provider)
        if (shimDisconnect) storage?.setItem(disconnectedKey, 'true')
        try {
          // EIP-2255: supported by MetaMask 12+, harmless elsewhere.
          await provider?.request({
            method: 'wallet_revokePermissions',
            params: [{ eth_accounts: {} }],
          } as never)
        } catch {
          /* not supported — the shim above is the fallback */
        }
      },

      async getAccounts() {
        const provider = await requireProvider()
        return uniqueAddresses((await provider.request({ method: 'eth_accounts' })) as string[])
      },

      async getChainId() {
        const provider = await requireProvider()
        return normalizeChainId(await provider.request({ method: 'eth_chainId' }))
      },

      async getProvider() {
        return target.provider()
      },

      async isAuthorized() {
        try {
          if (shimDisconnect && storage?.getItem(disconnectedKey) === 'true') return false
          const provider = target.provider()
          if (!provider) return false
          const accounts = (await provider.request({ method: 'eth_accounts' })) as Address[]
          return accounts.length > 0
        } catch {
          return false
        }
      },

      async switchChain({ chainId }): Promise<ChainDescriptor> {
        const provider = await requireProvider()
        const chain = chains.find((candidate) => candidate.id === Number(chainId))
        if (!chain) throw new ChainNotConfiguredError(chainId)

        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: toHexChainId(Number(chainId)) }],
          })
          return fromViemChain(chain)
        } catch (error) {
          if (isUserRejectedError(error)) throw new UserRejectedRequestError({ cause: error })
          // 4902 / -32603: the wallet does not know this chain yet.
          const code = (error as { code?: number }).code
          if (code !== 4902 && code !== -32603) throw toError(error)

          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: toHexChainId(Number(chainId)),
                  chainName: chain.name,
                  nativeCurrency: chain.nativeCurrency,
                  rpcUrls: [...chain.rpcUrls.default.http],
                  blockExplorerUrls: chain.blockExplorers?.default
                    ? [chain.blockExplorers.default.url]
                    : undefined,
                },
              ],
            })
            return fromViemChain(chain)
          } catch (addError) {
            if (isUserRejectedError(addError))
              throw new UserRejectedRequestError({ cause: addError })
            throw toError(addError)
          }
        }
      },

      async getWalletInfo(): Promise<WalletInfo | undefined> {
        const provider = target.provider()
        if (!provider) return undefined

        // A wallet announced over EIP-6963 already told us who it is.
        if (target.rdns)
          return { name: target.name, icon: target.icon, rdns: target.rdns }

        // Otherwise this is the generic `window.ethereum` connector, so fall
        // back to sniffing the provider's own flags for a real name.
        const detected = detectInjectedWallet(provider)
        if (detected) return { name: detected.name, rdns: detected.rdns }
        return { name: target.name }
      },

      async setup() {
        const provider = target.provider()
        if (provider) attach(provider)
      },
    }

    return connector
  }
}
