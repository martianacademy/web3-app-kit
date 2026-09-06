type WalletIconsPayload = {
  v: number
  generatedAt: string
  /** Interned `data:` URIs. */
  icons: string[]
  /** `[key, iconIndex]` where key is an rdns or a connector id, lowercased. */
  byKey: Array<[key: string, index: number]>
}

export type WalletIconQuery = {
  /** Reverse-DNS id, e.g. `io.metamask`. Matched first. */
  rdns?: string
  /** Connector id, e.g. `walletConnect` or `coinbaseWallet`. */
  connectorId?: string
  /** Display name, e.g. `MetaMask`. Matched last, case-insensitively. */
  name?: string
}

export type WalletIcons = {
  /** Number of wallets with a bundled logo. */
  readonly size: number
  readonly generatedAt: string
  /** A `data:` URI, or `undefined` when this wallet has no bundled logo. */
  get(wallet: WalletIconQuery): string | undefined
}

let walletsPromise: Promise<WalletIcons> | undefined

/**
 * Logos for wallets that never hand one over.
 *
 * An EIP-6963 wallet announces its own icon, so it never needs this. The gaps
 * are the built-in connectors — WalletConnect, Coinbase — and the wallets that
 * only take over `window.ethereum`, which `detectInjectedWallet` can name but
 * which supply no artwork at all.
 */
export function loadWalletIcons(): Promise<WalletIcons> {
  walletsPromise ??= import('./data/wallet-icons.js').then(({ WALLET_ICONS_JSON }) =>
    buildWalletIcons(JSON.parse(WALLET_ICONS_JSON) as WalletIconsPayload),
  )
  return walletsPromise
}

function buildWalletIcons(payload: WalletIconsPayload): WalletIcons {
  const byKey = new Map(payload.byKey)

  return {
    size: byKey.size,
    generatedAt: payload.generatedAt,
    get(wallet) {
      for (const candidate of [wallet.rdns, wallet.connectorId, wallet.name]) {
        if (!candidate) continue
        const index = byKey.get(candidate.trim().toLowerCase())
        if (index !== undefined) return payload.icons[index]
      }
      return undefined
    },
  }
}
