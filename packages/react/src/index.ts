export {
  Web3AppKitProvider,
  useConfig,
  useWeb3AppKitContext,
  type ModalOptions,
  type Web3AppKitContextValue,
  type Web3AppKitProviderProps,
} from './context.js'

export * from './hooks/index.js'

export {
  ConnectButton,
  type ConnectButtonProps,
  type ConnectButtonRenderProps,
} from './components/ConnectButton.js'

export { shallowEqual, type Mutation, type MutationState } from './internal.js'

// Re-exported so apps can build a config from the chain registry without a
// second import.
export {
  IPFS_GATEWAYS,
  loadChainIcons,
  loadChainRegistry,
  loadTokenIcons,
  loadWalletIcons,
  setIpfsGateway,
  toViemChain,
  toViemChains,
  tokenIconUrl,
  type ChainEntry,
  type ChainIcon,
  type ChainIconSource,
  type IconUrlOptions,
  type TokenIcon,
  type TokenQuery,
} from '@web3-app-kit/chains'

// Re-exported so apps can build a config without a second import.
export {
  createConfig,
  createStorage,
  injected,
  coinbaseWallet,
  walletConnect,
  shortenAddress,
  type Config,
  type Connector,
  type CreateConfigParameters,
  type WalletInfo,
} from '@web3-app-kit/core'
