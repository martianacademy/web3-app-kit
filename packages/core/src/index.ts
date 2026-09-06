export { createConfig, type Config, type CreateConfigParameters } from './config.js'

export {
  CHAIN_NAMESPACES,
  NAMESPACE_LABELS,
  bitcoinMainnet,
  bitcoinTestnet,
  defineChain,
  fromViemChain,
  isNamespace,
  parseCaip2,
  solanaDevnet,
  solanaMainnet,
  toCaip2,
  type Caip2,
  type ChainDescriptor,
  type ChainNamespace,
} from './caip.js'

export {
  ChainNotConfiguredError,
  ConnectorNotFoundError,
  NotConnectedError,
  ProviderNotFoundError,
  SwitchChainNotSupportedError,
  UserRejectedRequestError,
  Web3AppKitError,
  isUserRejectedError,
  toError,
} from './errors.js'

export { createEmitter } from './emitter.js'
export { createStorage, memoryStorage, noopStorage } from './storage.js'
export { createStore, type Store } from './store.js'

export {
  deepEqualAccounts,
  getChain,
  isAddressEqual,
  normalizeChainId,
  shortenAddress,
  toHexChainId,
  uniqueAddresses,
} from './utils.js'

export * from './actions/index.js'
export * from './connectors/index.js'

export type {
  Address,
  Chain,
  ChainId,
  Connection,
  ConnectResult,
  ConnectionStatus,
  Connector,
  ConnectorEmitter,
  ConnectorEventMap,
  ConnectorType,
  CreateConnectorFn,
  EIP1193Provider,
  State,
  Storage,
  Transport,
  WalletInfo,
} from './types.js'
