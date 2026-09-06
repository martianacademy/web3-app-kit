import { NATIVE_TOKEN_ADDRESS, type SwapToken } from '@web3-app-kit/swap'

/**
 * Tokens the swap view offers, per chain. There is deliberately no default
 * list in the SDK: which tokens a dApp is willing to route is a trust
 * decision, and an unvetted list is how users get handed lookalike contracts.
 */
export const swapTokens: Record<number, readonly SwapToken[]> = {
  1: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', decimals: 18, name: 'Ether' },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', decimals: 18 },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8 },
  ],
  8453: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', decimals: 18, name: 'Ether' },
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
  ],
  42161: [
    { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', decimals: 18, name: 'Ether' },
    { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6 },
    { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
  ],
}
