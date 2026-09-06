import {
  bitcoinMainnet,
  bitcoinWallets,
  coinbaseWallet,
  createConfig,
  injected,
  solanaMainnet,
  walletConnect,
} from '@web3-app-kit/core'
import { arbitrum, base, mainnet, optimism, polygon } from '@web3-app-kit/core/chains'
import { http } from 'viem'

const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined

export const config = createConfig({
  chains: [mainnet, base, arbitrum, optimism, polygon],
  // Solana and Bitcoin are not viem chains, so they live here. Solana wallets
  // are discovered through Wallet Standard; Bitcoin has no such standard, so
  // each supported wallet is registered explicitly.
  otherChains: [solanaMainnet, bitcoinMainnet],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'web3-app-kit example' }),
    ...bitcoinWallets(),
    // WalletConnect needs a project id, so it is only offered when one is set.
    ...(projectId ? [walletConnect({ projectId })] : []),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
  },
})
