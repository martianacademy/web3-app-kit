export { injected, type InjectedParameters, type InjectedTarget } from './injected.js'
export {
  DETECTABLE_WALLETS,
  detectInjectedWallet,
  type DetectedWallet,
} from './detect.js'
export {
  discoverProviders,
  startEip6963Discovery,
  type Eip6963ProviderDetail,
  type Eip6963ProviderInfo,
} from './eip6963.js'
export {
  walletConnect,
  type WalletConnectMetadata,
  type WalletConnectParameters,
} from './walletConnect.js'
export { coinbaseWallet, type CoinbaseWalletParameters } from './coinbase.js'
export {
  solana,
  startWalletStandardDiscovery,
  type SolanaParameters,
  type WalletStandardAccount,
  type WalletStandardWallet,
} from './solana.js'
export {
  BITCOIN_TARGETS,
  bitcoin,
  bitcoinWallets,
  leatherTarget,
  okxBitcoinTarget,
  unisatTarget,
  xverseTarget,
  type BitcoinApiKind,
  type BitcoinParameters,
  type BitcoinTarget,
} from './bitcoin.js'
