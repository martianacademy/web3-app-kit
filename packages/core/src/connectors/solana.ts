import { solanaMainnet, type ChainDescriptor } from '../caip.js'
import {
  ChainNotConfiguredError,
  ProviderNotFoundError,
  UserRejectedRequestError,
  isUserRejectedError,
  toError,
} from '../errors.js'
import type { ConnectResult, Connector, CreateConnectorFn, WalletInfo } from '../types.js'

/**
 * Wallet Standard is Solana's answer to EIP-6963: wallets register themselves
 * on the page and every one of them is driven through the same feature set,
 * so Phantom, Solflare, Backpack and the rest need no per-wallet code.
 */
export type WalletStandardAccount = {
  address: string
  publicKey: Uint8Array
  chains: readonly string[]
  features: readonly string[]
}

export type WalletStandardWallet = {
  version: string
  name: string
  icon: string
  chains: readonly string[]
  features: Record<string, unknown>
  accounts: readonly WalletStandardAccount[]
}

type ConnectFeature = { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletStandardAccount[] }> }
type DisconnectFeature = { disconnect(): Promise<void> }
type EventsFeature = { on(event: 'change', listener: (properties: { accounts?: readonly WalletStandardAccount[]; chains?: readonly string[] }) => void): () => void }

const FEATURE_CONNECT = 'standard:connect'
const FEATURE_DISCONNECT = 'standard:disconnect'
const FEATURE_EVENTS = 'standard:events'

/**
 * Wallet Standard names Solana chains `solana:mainnet`, while CAIP-2 uses the
 * truncated genesis hash. Both appear in the wild, so the connector speaks
 * CAIP-2 outwards and translates at the boundary.
 */
const CHAIN_BY_ALIAS: Record<string, string> = {
  'solana:mainnet': solanaMainnet.reference,
  'solana:mainnet-beta': solanaMainnet.reference,
  'solana:devnet': 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  'solana:testnet': '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
}

function toReference(chain: string | undefined): string {
  if (!chain) return solanaMainnet.reference
  if (CHAIN_BY_ALIAS[chain]) return CHAIN_BY_ALIAS[chain]!
  const [, reference] = chain.split(':')
  return reference || solanaMainnet.reference
}

export type SolanaParameters = {
  /** The registered wallet to wrap. Omit to use Wallet Standard discovery. */
  wallet?: WalletStandardWallet
}

/**
 * One Solana wallet, driven through Wallet Standard. Usually created for you
 * by {@link startWalletStandardDiscovery} rather than by hand.
 */
export function solana(parameters: SolanaParameters): CreateConnectorFn {
  const wallet = parameters.wallet
  if (!wallet) throw new Error('`solana` needs a Wallet Standard wallet.')

  return ({ allChains, emitter }) => {
    let accounts: readonly WalletStandardAccount[] = []
    let chainReference = toReference(wallet.chains[0])
    let offChange: (() => void) | undefined

    const feature = <value>(name: string): value | undefined =>
      wallet.features[name] as value | undefined

    function attach() {
      if (offChange) return
      const events = feature<EventsFeature>(FEATURE_EVENTS)
      offChange = events?.on('change', (properties) => {
        if (properties.accounts) {
          accounts = properties.accounts
          const addresses = accounts.map((account) => account.address)
          if (addresses.length === 0) emitter.emit('disconnect', undefined)
          else emitter.emit('change', { accounts: addresses })
        }
        if (properties.chains?.[0]) {
          chainReference = toReference(properties.chains[0])
          emitter.emit('change', { chainId: chainReference })
        }
      })
    }

    const connector: Connector = {
      id: `solana:${wallet.name}`,
      namespace: 'solana',
      name: wallet.name,
      type: 'walletStandard',
      icon: wallet.icon,
      emitter,
      // Always true, and not a shortcut: a Wallet Standard connector only
      // exists because the wallet registered itself, so its presence already
      // proves it is installed. Same guarantee EIP-6963 gives on EVM.
      isAvailable: () => true,

      async connect({ isReconnecting } = {}): Promise<ConnectResult> {
        const connectFeature = feature<ConnectFeature>(FEATURE_CONNECT)
        if (!connectFeature) throw new ProviderNotFoundError(wallet.name)

        try {
          // `silent` is Wallet Standard's "reconnect without a prompt".
          const result = await connectFeature.connect(
            isReconnecting ? { silent: true } : undefined,
          )
          accounts = result.accounts.length > 0 ? result.accounts : wallet.accounts
          if (accounts.length === 0) throw new ProviderNotFoundError(wallet.name)

          attach()
          chainReference = toReference(accounts[0]?.chains[0] ?? wallet.chains[0])
          return { accounts: accounts.map((account) => account.address), chainId: chainReference }
        } catch (error) {
          if (isUserRejectedError(error)) throw new UserRejectedRequestError({ cause: error })
          throw toError(error)
        }
      },

      async disconnect() {
        offChange?.()
        offChange = undefined
        accounts = []
        await feature<DisconnectFeature>(FEATURE_DISCONNECT)?.disconnect().catch(() => {})
      },

      async getAccounts() {
        return (accounts.length > 0 ? accounts : wallet.accounts).map(
          (account) => account.address,
        )
      },

      async getChainId() {
        return chainReference
      },

      async getProvider() {
        return wallet
      },

      async isAuthorized() {
        // Wallet Standard exposes previously granted accounts directly.
        return wallet.accounts.length > 0
      },

      async switchChain({ chainId }): Promise<ChainDescriptor> {
        const chain = allChains.find(
          (candidate) =>
            candidate.namespace === 'solana' && candidate.reference === String(chainId),
        )
        if (!chain) throw new ChainNotConfiguredError(chainId)
        // Solana wallets pick their own cluster; the dApp follows rather than
        // drives, so this only records the choice.
        chainReference = chain.reference
        emitter.emit('change', { chainId: chainReference })
        return chain
      },

      async getWalletInfo(): Promise<WalletInfo | undefined> {
        return { name: wallet.name, icon: wallet.icon }
      },

      async setup() {
        if (wallet.accounts.length > 0) {
          accounts = wallet.accounts
          attach()
        }
      },
    }

    return connector
  }
}

// ---------------------------------------------------------------------------
// Discovery

/**
 * The app side of the Wallet Standard handshake.
 *
 * Two directions have to be covered. Wallets already on the page are waiting
 * for `app-ready` and call `register` on the API it carries. Wallets that load
 * later dispatch `register-wallet` whose `detail` is a *callback* the app
 * invokes with that same API — not an object with a `register` method, which
 * is the easy thing to get wrong.
 */
const APP_READY = 'wallet-standard:app-ready'
const REGISTER = 'wallet-standard:register-wallet'

type AppApi = { register(...wallets: WalletStandardWallet[]): () => void }
type RegisterEvent = CustomEvent<(api: AppApi) => void>

export function startWalletStandardDiscovery(
  onWallet: (wallet: WalletStandardWallet) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}

  const seen = new Set<string>()
  const accept = (wallet: WalletStandardWallet | undefined) => {
    if (!wallet?.name || seen.has(wallet.name)) return
    if (!wallet.chains?.some((chain) => chain.startsWith('solana:'))) return
    if (!wallet.features?.[FEATURE_CONNECT]) return
    seen.add(wallet.name)
    onWallet(wallet)
  }

  const api: AppApi = {
    register(...wallets) {
      wallets.forEach(accept)
      return () => {}
    },
  }

  const onRegister = (event: Event) => {
    const callback = (event as RegisterEvent).detail
    if (typeof callback === 'function') callback(api)
  }

  window.addEventListener(REGISTER, onRegister)
  window.dispatchEvent(new CustomEvent(APP_READY, { detail: api }))

  // Wallets that were still initialising get a second chance.
  const timer = setTimeout(
    () => window.dispatchEvent(new CustomEvent(APP_READY, { detail: api })),
    300,
  )

  return () => {
    clearTimeout(timer)
    window.removeEventListener(REGISTER, onRegister)
  }
}
