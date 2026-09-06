import { formatUnits, type Address } from 'viem'

import {
  SwapError,
  isNativeToken,
  type SwapConfig,
  type SwapQuote,
  type SwapQuoteRequest,
} from './types.js'

/**
 * DODO's SmartTrade route endpoint. The parameter and response names below are
 * the ones DODO's own widget sends and reads, not a guess at the shape.
 */
export const DODO_ROUTE_URL = 'https://api.dodoex.io/route-service/v2/widget/getdodoroute'

/** Raw shape of `response.data` from the route endpoint. */
type DodoRouteData = {
  to?: string
  data?: string
  value?: string | number
  gasLimit?: string | number
  /** Present when the allowance must go somewhere other than `to`. */
  targetApproveAddr?: string
  useSource?: string
  resAmount?: number | string
  minReturnAmount?: number | string
  priceImpact?: number | string
  baseFeeAmount?: number | string
  baseFeeRate?: number | string
  resPricePerFromToken?: number | string
  resPricePerToToken?: number | string
}

type DodoRouteResponse = {
  /** `200` on success; `-1` puts the error message in `data` as a string. */
  status?: number
  data?: DodoRouteData | string
  msg?: string
  message?: string
}

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export type GetRouteOptions = {
  config: SwapConfig
  request: SwapQuoteRequest
  signal?: AbortSignal
  /** Injected in tests; defaults to global `fetch`. */
  fetchImpl?: FetchLike
}

/**
 * Asks DODO for a route and returns a ready-to-send transaction.
 *
 * The fee is only applied when `feeRecipient` and `feeRate` are both set —
 * DODO ignores `rebateTo` without `fee` and vice versa, so sending one alone
 * would silently produce a fee-free swap.
 */
export async function getDodoRoute(options: GetRouteOptions): Promise<SwapQuote> {
  const { config, request, signal } = options
  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)
  if (!doFetch) throw new SwapError('No `fetch` available in this environment.')
  if (!config.apiKey) throw new SwapError('A DODO API key is required.')

  if (config.fee !== undefined && !Number.isInteger(config.fee))
    throw new SwapError(`\`fee\` must be a whole number, got ${config.fee}.`)

  const deadlineMinutes = config.deadlineMinutes ?? 10
  const expiresAt = Math.floor(Date.now() / 1000) + deadlineMinutes * 60

  const params = new URLSearchParams({
    chainId: String(request.chainId),
    deadLine: String(expiresAt),
    apikey: config.apiKey,
    slippage: String(config.slippage ?? 1),
    source: config.source ?? 'dodoV2AndMixWasm',
    toTokenAddress: request.toToken.address,
    fromTokenAddress: request.fromToken.address,
    userAddr: request.account,
    // Simulating an ERC-20 route reverts until the allowance exists, so it is
    // only requested when the input needs no approval.
    estimateGas: String(config.estimateGas ?? isNativeToken(request.fromToken.address)),
    fromAmount: request.fromAmount.toString(),
  })

  const hasConfiguredFee = !!config.feeRecipient && config.fee !== undefined
  if (hasConfiguredFee) {
    params.set('rebateTo', config.feeRecipient!)
    params.set('fee', String(config.fee))
  }

  const base = config.baseUrl ?? DODO_ROUTE_URL
  const response = await doFetch(`${base}?${params.toString()}`, signal ? { signal } : {})
  if (!response.ok)
    throw new SwapError(`DODO route request failed with ${response.status}.`, response.status)

  const body = (await response.json()) as DodoRouteResponse
  // A rejected request comes back as `status: -1` with the reason in `data` as
  // a plain string, so the message has to be read from there.
  if (typeof body?.data === 'string')
    throw new SwapError(body.data, body)

  const data = body?.data
  if (!data?.to || !data.data)
    throw new SwapError(body?.msg ?? body?.message ?? 'No route found for this pair.', body)

  const toAmount = parseAmount(data.resAmount, request.toToken.decimals)

  return {
    request,
    toAmount,
    toAmountFormatted: formatUnits(toAmount, request.toToken.decimals),
    minToAmount: data.minReturnAmount === undefined ? 0n : BigInt(data.minReturnAmount),
    pricePerFromToken: Number(data.resPricePerFromToken ?? 0),
    pricePerToToken: Number(data.resPricePerToToken ?? 0),
    priceImpact: Number(data.priceImpact ?? 0),
    hasConfiguredFee,
    ...(data.baseFeeAmount !== undefined
      ? { protocolFee: { amount: Number(data.baseFeeAmount), rate: Number(data.baseFeeRate ?? 0) } }
      : {}),
    transaction: {
      to: data.to as Address,
      data: data.data as `0x${string}`,
      value: BigInt(data.value ?? 0),
      ...(data.gasLimit ? { gas: BigInt(data.gasLimit) } : {}),
    },
    // Falls back to `to`: when DODO does not name a separate proxy, the router
    // itself is what pulls the tokens.
    spender: (data.targetApproveAddr ?? data.to) as Address,
    ...(data.useSource ? { source: data.useSource } : {}),
    expiresAt,
  }
}

/**
 * `resAmount` comes back as a human-readable number, not base units, so it is
 * scaled here rather than passed through — a raw `1.5` would otherwise be read
 * as 1.5 wei.
 */
function parseAmount(value: number | string | undefined, decimals: number): bigint {
  if (value === undefined || value === null || value === '') return 0n
  const text = String(value)
  if (!/^\d*\.?\d+(?:e[+-]?\d+)?$/i.test(text)) return 0n

  const normalized = text.includes('e') ? Number(text).toFixed(decimals) : text
  const [whole = '0', fraction = ''] = normalized.split('.')
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(whole + padded)
}
