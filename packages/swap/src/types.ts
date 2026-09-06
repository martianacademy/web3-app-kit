import type { Address } from 'viem'

/** The address DODO uses to mean "the chain's native coin", not an ERC-20. */
export const NATIVE_TOKEN_ADDRESS: Address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

export function isNativeToken(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
}

export type SwapToken = {
  address: Address
  symbol: string
  decimals: number
  name?: string
  /** Logo URL. `@web3-app-kit/chains` can resolve one from the address. */
  icon?: string
}

/**
 * Everything about a swap that a dApp may want to own — including the fee it
 * takes on each trade.
 */
export type SwapConfig = {
  /** DODO API key. Required; the route endpoint rejects requests without one. */
  apiKey: string
  /**
   * Where your cut of each swap is sent. DODO only applies a fee when both
   * this and {@link SwapConfig.feeRate} are set, so neither works alone.
   */
  feeRecipient?: Address
  /**
   * Your cut, passed straight through as DODO's `fee` parameter.
   *
   * Must be a whole number — the parameter is a uint and answers `0.3` with
   * `cannot parsed as uint`. The value is embedded verbatim in the swap
   * calldata, and **DODO does not document what it is denominated in**: it is
   * not stated in their API docs or in `@dodoex/widgets`' `feeRate` type, and
   * it cannot be derived from the quote, because the response is identical
   * whether you send `10`, `1000` or nothing at all.
   *
   * Confirm the denomination with DODO, or with one small real trade, before
   * relying on it — the difference between basis points and percent is 100x
   * of someone's money.
   */
  fee?: number
  /** Slippage tolerance in percent. Defaults to `1`. */
  slippage?: number
  /** How long a quote stays valid, in minutes. Defaults to `10`. */
  deadlineMinutes?: number
  /**
   * `dodoV2AndMixWasm` is DODO's full router. `noMaxHops` restricts routing to
   * direct pairs, which quotes worse but costs less gas.
   */
  source?: 'dodoV2AndMixWasm' | 'noMaxHops'
  /**
   * Ask the API to simulate the swap for a gas estimate.
   *
   * Defaults to `true` for native input and `false` for ERC-20, because
   * simulating an ERC-20 route reverts with `SafeERC20: low-level call failed`
   * until the allowance exists — which would make it impossible to quote the
   * swap the user is about to approve.
   */
  estimateGas?: boolean
  /** Override the endpoint, e.g. to route through your own proxy. */
  baseUrl?: string
  /** Chains the UI offers for swapping. Defaults to every EVM chain in the config. */
  chainIds?: readonly number[]
}

export type SwapQuoteRequest = {
  chainId: number
  fromToken: SwapToken
  toToken: SwapToken
  /** Amount of `fromToken`, in its smallest unit. */
  fromAmount: bigint
  /** The account that will send the swap. */
  account: Address
}

export type SwapQuote = {
  request: SwapQuoteRequest
  /** Expected output, in `toToken`'s smallest unit. */
  toAmount: bigint
  /** Human-readable output, already scaled by `toToken.decimals`. */
  toAmountFormatted: string
  /**
   * The least the swap can return at the configured slippage, in base units.
   * Taken from DODO's `minReturnAmount`, which already arrives in base units
   * and so needs no scaling of ours.
   */
  minToAmount: bigint
  pricePerFromToken: number
  pricePerToToken: number
  /** Price impact as a fraction — `0.0001` is 0.01%. */
  priceImpact: number
  /** DODO's own protocol fee on this route, not yours. */
  protocolFee?: { amount: number; rate: number }
  /**
   * `true` when a `fee` was configured. The amounts above are DODO's quote,
   * which does **not** deduct it — the fee is taken by the router at
   * execution, so the wallet receives less than `toAmount`.
   */
  hasConfiguredFee: boolean
  /** The transaction to send. */
  transaction: {
    to: Address
    data: `0x${string}`
    value: bigint
    gas?: bigint
  }
  /**
   * Contract that must hold the ERC-20 allowance. DODO returns this
   * separately from `to` when the router proxies through another contract;
   * when it does not, it is the same address.
   */
  spender: Address
  /** Router DODO chose, e.g. `dodo`, `weth`. Useful for diagnostics. */
  source?: string
  /** When the quote stops being valid. */
  expiresAt: number
}

export class SwapError extends Error {
  override name = 'SwapError'
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
  }
}
