import { bitcoinMainnet, bitcoinTestnet, type ChainDescriptor } from '../caip.js'
import {
  ChainNotConfiguredError,
  ProviderNotFoundError,
  UserRejectedRequestError,
  isUserRejectedError,
  toError,
} from '../errors.js'
import type { ConnectResult, Connector, CreateConnectorFn, WalletInfo } from '../types.js'

/**
 * Bitcoin has no EIP-6963 and no Wallet Standard: every wallet injects its own
 * object with its own method names. Two shapes cover the wallets people
 * actually use, so each is implemented once and the wallets themselves are
 * described as data.
 *
 * - `unisat`  — `requestAccounts()` / `getNetwork()`, used by UniSat and OKX.
 * - `request` — a single JSON-RPC-ish `request(method, params)`, used by
 *               Leather and Xverse.
 */
export type BitcoinApiKind = 'unisat' | 'request'

export type BitcoinTarget = {
  id: string
  name: string
  kind: BitcoinApiKind
  icon?: string
  downloadUrl?: string
  /** Resolves the injected object. Return `undefined` when not installed. */
  provider: () => unknown
  /** `request` wallets differ in which method lists addresses. */
  addressMethod?: string
}

type UnisatApi = {
  requestAccounts(): Promise<string[]>
  getAccounts(): Promise<string[]>
  getNetwork?(): Promise<string>
  switchNetwork?(network: string): Promise<void>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
}

type RequestApi = {
  request(method: string, params?: unknown): Promise<{ result?: unknown }>
}

type InjectedWindow = Record<string, any>

const win = (): InjectedWindow | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as InjectedWindow)

/** UniSat. */
export const unisatTarget: BitcoinTarget = {
  id: 'unisat',
  name: 'UniSat',
  kind: 'unisat',
  downloadUrl: 'https://unisat.io/download',
  provider: () => win()?.['unisat'],
}

/** OKX Wallet's Bitcoin provider, which mirrors UniSat's API. */
export const okxBitcoinTarget: BitcoinTarget = {
  id: 'okxBitcoin',
  name: 'OKX Wallet',
  kind: 'unisat',
  downloadUrl: 'https://www.okx.com/web3',
  provider: () => win()?.['okxwallet']?.bitcoin,
}

/** Leather, formerly Hiro. */
export const leatherTarget: BitcoinTarget = {
  id: 'leather',
  name: 'Leather',
  kind: 'request',
  addressMethod: 'getAddresses',
  downloadUrl: 'https://leather.io/install-extension',
  provider: () => win()?.['LeatherProvider'],
}

/** Xverse, via its sats-connect style provider. */
export const xverseTarget: BitcoinTarget = {
  id: 'xverse',
  name: 'Xverse',
  kind: 'request',
  addressMethod: 'getAccounts',
  downloadUrl: 'https://www.xverse.app/download',
  provider: () => win()?.['XverseProviders']?.BitcoinProvider ?? win()?.['BitcoinProvider'],
}

export const BITCOIN_TARGETS: readonly BitcoinTarget[] = [
  unisatTarget,
  xverseTarget,
  leatherTarget,
  okxBitcoinTarget,
]

export type BitcoinParameters = {
  target: BitcoinTarget
}

export function bitcoin(parameters: BitcoinParameters): CreateConnectorFn {
  const { target } = parameters

  return ({ allChains, emitter }) => {
    let addresses: readonly string[] = []
    let reference = bitcoinMainnet.reference
    let listenersAttached = false

    const onAccountsChanged = (next: unknown) => {
      const list = Array.isArray(next) ? (next as string[]).filter(Boolean) : []
      addresses = list
      if (list.length === 0) emitter.emit('disconnect', undefined)
      else emitter.emit('change', { accounts: list })
    }

    function requireProvider(): unknown {
      const provider = target.provider()
      if (!provider) throw new ProviderNotFoundError(target.name)
      return provider
    }

    function attach(provider: unknown) {
      if (listenersAttached || target.kind !== 'unisat') return
      const api = provider as UnisatApi
      if (!api.on) return
      listenersAttached = true
      api.on('accountsChanged', onAccountsChanged)
    }

    /** Pulls addresses out of the several shapes `request` wallets return. */
    function readAddresses(payload: unknown): string[] {
      const result = (payload as { result?: unknown })?.result ?? payload
      const list = Array.isArray(result)
        ? result
        : ((result as { addresses?: unknown } | undefined)?.addresses ?? [])
      if (!Array.isArray(list)) return []
      return list
        .map((entry) =>
          typeof entry === 'string' ? entry : (entry as { address?: string })?.address,
        )
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    }

    const connector: Connector = {
      id: target.id,
      namespace: 'bip122',
      name: target.name,
      type: 'bitcoin',
      icon: target.icon,
      downloadUrl: target.downloadUrl,
      emitter,

      isAvailable: () => !!target.provider(),

      async connect({ isReconnecting } = {}): Promise<ConnectResult> {
        const provider = requireProvider()
        try {
          if (target.kind === 'unisat') {
            const api = provider as UnisatApi
            const list = isReconnecting ? await api.getAccounts() : await api.requestAccounts()
            addresses = (list ?? []).filter(Boolean)
            if (addresses.length === 0) throw new ProviderNotFoundError(target.name)

            const network = await api.getNetwork?.().catch(() => undefined)
            reference =
              network && network !== 'livenet' && network !== 'mainnet'
                ? bitcoinTestnet.reference
                : bitcoinMainnet.reference
          } else {
            const api = provider as RequestApi
            const payload = await api.request(target.addressMethod ?? 'getAddresses', {
              purposes: ['payment', 'ordinals'],
            })
            addresses = readAddresses(payload)
            if (addresses.length === 0) throw new ProviderNotFoundError(target.name)
          }

          attach(provider)
          return { accounts: addresses, chainId: reference }
        } catch (error) {
          if (isUserRejectedError(error)) throw new UserRejectedRequestError({ cause: error })
          throw toError(error)
        }
      },

      async disconnect() {
        if (target.kind === 'unisat' && listenersAttached)
          (target.provider() as UnisatApi | undefined)?.removeListener?.(
            'accountsChanged',
            onAccountsChanged,
          )
        listenersAttached = false
        addresses = []
      },

      async getAccounts() {
        if (target.kind !== 'unisat') return addresses
        const api = target.provider() as UnisatApi | undefined
        if (!api) return []
        return (await api.getAccounts().catch(() => [])) ?? []
      },

      async getChainId() {
        return reference
      },

      async getProvider() {
        return target.provider()
      },

      async isAuthorized() {
        try {
          const provider = target.provider()
          if (!provider) return false
          // `request` wallets have no silent path, and prompting during an
          // auto-reconnect is worse than not restoring the session.
          if (target.kind !== 'unisat') return false
          const list = await (provider as UnisatApi).getAccounts()
          return (list?.length ?? 0) > 0
        } catch {
          return false
        }
      },

      async switchChain({ chainId }): Promise<ChainDescriptor> {
        const chain = allChains.find(
          (candidate) =>
            candidate.namespace === 'bip122' && candidate.reference === String(chainId),
        )
        if (!chain) throw new ChainNotConfiguredError(chainId)

        if (target.kind === 'unisat')
          await (target.provider() as UnisatApi | undefined)?.switchNetwork?.(
            chain.reference === bitcoinTestnet.reference ? 'testnet' : 'livenet',
          )

        reference = chain.reference
        emitter.emit('change', { chainId: reference })
        return chain
      },

      async getWalletInfo(): Promise<WalletInfo | undefined> {
        return { name: target.name, icon: target.icon }
      },
    }

    return connector
  }
}

/** A connector for every supported Bitcoin wallet, installed or not. */
export function bitcoinWallets(
  targets: readonly BitcoinTarget[] = BITCOIN_TARGETS,
): readonly CreateConnectorFn[] {
  return targets.map((target) => bitcoin({ target }))
}
