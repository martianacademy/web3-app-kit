import type { EIP1193Provider } from 'viem'

/**
 * Flags injected wallets set on their provider, most specific first.
 *
 * Order matters: a great many wallets also set `isMetaMask` so that dApps
 * sniffing for MetaMask still work, so every distinctive flag has to be
 * checked before that one or everything reports as MetaMask.
 */
const WALLET_FLAGS: ReadonlyArray<readonly [flag: string, name: string, rdns?: string]> = [
  ['isRabby', 'Rabby', 'io.rabby'],
  ['isBraveWallet', 'Brave Wallet', 'com.brave.wallet'],
  ['isAvalanche', 'Core', 'app.core.extension'],
  ['isCoinbaseWallet', 'Coinbase Wallet', 'com.coinbase.wallet'],
  ['isCoinbaseBrowser', 'Coinbase Wallet', 'com.coinbase.wallet'],
  ['isPhantom', 'Phantom', 'app.phantom'],
  ['isRainbow', 'Rainbow', 'me.rainbow'],
  ['isZerion', 'Zerion', 'io.zerion.wallet'],
  ['isTrust', 'Trust Wallet', 'com.trustwallet.app'],
  ['isTrustWallet', 'Trust Wallet', 'com.trustwallet.app'],
  ['isOkxWallet', 'OKX Wallet', 'com.okex.wallet'],
  ['isOKExWallet', 'OKX Wallet', 'com.okex.wallet'],
  ['isBitKeep', 'Bitget Wallet', 'com.bitget.web3'],
  ['isTokenPocket', 'TokenPocket', 'pro.tokenpocket'],
  ['isExodus', 'Exodus', 'com.exodus.web3-wallet'],
  ['isFrame', 'Frame', 'sh.frame'],
  ['isTaho', 'Taho', 'com.taho'],
  ['isTally', 'Taho', 'com.taho'],
  ['isOneInchWallet', '1inch Wallet', 'io.1inch.wallet'],
  ['isSafePal', 'SafePal', 'com.safepal'],
  ['isXDEFI', 'XDEFI', 'io.xdefi'],
  ['isMathWallet', 'MathWallet', 'com.mathwallet'],
  ['isOpera', 'Opera Wallet', 'com.opera'],
  ['isKuCoinWallet', 'KuCoin Wallet', 'com.kucoin.wallet'],
  ['isGamestop', 'GameStop Wallet', 'com.gamestop.wallet'],
  ['isMetaMask', 'MetaMask', 'io.metamask'],
] as const

export type DetectedWallet = {
  name: string
  rdns?: string
}

/**
 * Best-effort identification of an injected provider. EIP-6963 is the reliable
 * path and is preferred everywhere it works; this covers the wallets that still
 * only take over `window.ethereum`.
 */
export function detectInjectedWallet(
  provider: EIP1193Provider | undefined,
): DetectedWallet | undefined {
  if (!provider) return undefined
  const flags = provider as unknown as Record<string, unknown>

  for (const [flag, name, rdns] of WALLET_FLAGS)
    if (flags[flag] === true) return rdns ? { name, rdns } : { name }

  return undefined
}

/** Every wallet name this can identify. Exported for tests and docs. */
export const DETECTABLE_WALLETS: readonly string[] = [
  ...new Set(WALLET_FLAGS.map(([, name]) => name)),
]
