export {
  connect,
  resolveConnector,
  type ConnectParameters,
  type ConnectReturnType,
} from './connect.js'
export { disconnect, disconnectAll, type DisconnectParameters } from './disconnect.js'
export { switchChain, type SwitchChainParameters } from './switchChain.js'
export {
  getAccount,
  getChainId,
  getConnections,
  getWalletInfo,
  watchAccount,
  watchChainId,
  type GetAccountParameters,
  type GetAccountReturnType,
} from './getAccount.js'
export { getPublicClient, getWalletClient } from './clients.js'
export {
  getBalance,
  sendTransaction,
  signMessage,
  type GetBalanceParameters,
  type GetBalanceReturnType,
  type SendTransactionParameters,
  type SignMessageParameters,
} from './wallet.js'
export { getEnsAvatar, getEnsName } from './ens.js'
