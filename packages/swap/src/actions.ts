import { erc20Abi, maxUint256, type Address, type Hash } from 'viem'
import {
  getPublicClient,
  getWalletClient,
  type Config,
} from '@web3-app-kit/core'

import { getDodoRoute } from './dodo.js'
import { SwapError, isNativeToken, type SwapConfig, type SwapQuote, type SwapQuoteRequest } from './types.js'

export type QuoteParameters = SwapQuoteRequest & {
  signal?: AbortSignal
}

/**
 * Prices a swap and returns the transaction that performs it.
 *
 * Takes the SDK `config` for symmetry with every other action here, even
 * though routing is a plain HTTP call — callers should not have to remember
 * which of these need it.
 */
export async function getSwapQuote(
  _config: Config,
  swapConfig: SwapConfig,
  parameters: QuoteParameters,
): Promise<SwapQuote> {
  const { signal, ...request } = parameters
  if (request.fromAmount <= 0n) throw new SwapError('Enter an amount to swap.')
  if (request.fromToken.address.toLowerCase() === request.toToken.address.toLowerCase())
    throw new SwapError('Pick two different tokens.')

  return getDodoRoute({ config: swapConfig, request, ...(signal ? { signal } : {}) })
}

/**
 * How much of `fromToken` the router may already spend. Native coins need no
 * allowance, so they report an unlimited one rather than a special case at
 * every call site.
 */
export async function getSwapAllowance(
  config: Config,
  quote: SwapQuote,
): Promise<bigint> {
  const { fromToken, account, chainId } = quote.request
  if (isNativeToken(fromToken.address)) return maxUint256

  const client = getPublicClient(config, { chainId })
  return client.readContract({
    address: fromToken.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, quote.spender],
  })
}

export async function needsApproval(config: Config, quote: SwapQuote): Promise<boolean> {
  const allowance = await getSwapAllowance(config, quote)
  return allowance < quote.request.fromAmount
}

export type ApproveParameters = {
  /** Approve exactly this swap instead of an unlimited allowance. */
  exact?: boolean
}

/** Grants the router permission to move `fromToken`. */
export async function approveSwap(
  config: Config,
  quote: SwapQuote,
  parameters: ApproveParameters = {},
): Promise<Hash> {
  const { fromToken, chainId } = quote.request
  if (isNativeToken(fromToken.address))
    throw new SwapError('Native coins do not need an approval.')

  const client = await getWalletClient(config, { chainId })
  return client.writeContract({
    account: client.account!,
    chain: client.chain ?? null,
    address: fromToken.address,
    abi: erc20Abi,
    functionName: 'approve',
    args: [quote.spender, parameters.exact ? quote.request.fromAmount : maxUint256],
  })
}

/** Sends the swap. Quote must still be within its deadline. */
export async function executeSwap(config: Config, quote: SwapQuote): Promise<Hash> {
  if (quote.expiresAt * 1000 < Date.now())
    throw new SwapError('This quote has expired. Fetch a new one.')

  const client = await getWalletClient(config, { chainId: quote.request.chainId })
  return client.sendTransaction({
    account: client.account!,
    chain: client.chain ?? null,
    to: quote.transaction.to,
    data: quote.transaction.data,
    value: quote.transaction.value,
    ...(quote.transaction.gas ? { gas: quote.transaction.gas } : {}),
  })
}

/** Chains this swap config offers, defaulting to every EVM chain configured. */
export function getSwapChainIds(config: Config, swapConfig: SwapConfig): readonly number[] {
  return swapConfig.chainIds ?? config.chains.map((chain) => chain.id)
}

export type { Address }
