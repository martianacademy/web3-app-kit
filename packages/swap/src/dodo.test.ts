import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'

import { DODO_ROUTE_URL, getDodoRoute } from './dodo.js'
import { NATIVE_TOKEN_ADDRESS, SwapError, type SwapConfig, type SwapQuoteRequest } from './types.js'

const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ACCOUNT: Address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

const request: SwapQuoteRequest = {
  chainId: 1,
  fromToken: { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', decimals: 18 },
  toToken: { address: USDC, symbol: 'USDC', decimals: 6 },
  fromAmount: 10n ** 18n,
  account: ACCOUNT,
}

const ROUTE = {
  to: '0xa356867fDCEa8e71AEaF87805808803806231FDC',
  data: '0xabcdef',
  value: '1000000000000000000',
  gasLimit: '210000',
  useSource: 'dodo',
  resAmount: 2431.5,
  minReturnAmount: '2407185000',
  priceImpact: 0.0000733,
  baseFeeAmount: 3.6472,
  baseFeeRate: 0.0015,
  resPricePerFromToken: 2431.5,
  resPricePerToToken: 0.000411,
}

/** Captures the request the adapter builds, and replies with `body`. */
function stubFetch(body: unknown, ok = true, status = 200) {
  const calls: string[] = []
  const fetchImpl = async (url: string) => {
    calls.push(url)
    return { ok, status, json: async () => body }
  }
  const params = () => new URL(calls[0]!).searchParams
  return { fetchImpl, calls, params }
}

const config: SwapConfig = { apiKey: 'test-key' }

describe('getDodoRoute', () => {
  it('sends the parameters DODO expects', async () => {
    const stub = stubFetch({ data: ROUTE })
    await getDodoRoute({ config, request, fetchImpl: stub.fetchImpl })

    expect(stub.calls[0]!.startsWith(DODO_ROUTE_URL)).toBe(true)
    const params = stub.params()
    expect(params.get('chainId')).toBe('1')
    expect(params.get('apikey')).toBe('test-key')
    expect(params.get('fromTokenAddress')).toBe(NATIVE_TOKEN_ADDRESS)
    expect(params.get('toTokenAddress')).toBe(USDC)
    expect(params.get('fromAmount')).toBe('1000000000000000000')
    expect(params.get('userAddr')).toBe(ACCOUNT)
    expect(params.get('slippage')).toBe('1')
    expect(params.get('source')).toBe('dodoV2AndMixWasm')
    expect(Number(params.get('deadLine'))).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('applies the fee only when recipient and rate are both configured', async () => {
    const withFee = stubFetch({ data: ROUTE })
    await getDodoRoute({
      config: { ...config, feeRecipient: ACCOUNT, fee: 30 },
      request,
      fetchImpl: withFee.fetchImpl,
    })
    expect(withFee.params().get('rebateTo')).toBe(ACCOUNT)
    expect(withFee.params().get('fee')).toBe('30')
  })

  it('rejects a fractional fee before sending it', async () => {
    // DODO's `fee` is a uint: `0.3` comes back as
    // `the value "0.3" cannot parsed as uint`, so it is caught here instead.
    const stub = stubFetch({ data: ROUTE })
    await expect(
      getDodoRoute({
        config: { ...config, feeRecipient: ACCOUNT, fee: 0.3 },
        request,
        fetchImpl: stub.fetchImpl,
      }),
    ).rejects.toThrow(/whole number/)
    expect(stub.calls).toHaveLength(0)
  })

  it('flags that the quoted amount excludes a configured fee', async () => {
    // DODO returns the same amounts with or without a fee — the router takes
    // it at execution — so a UI showing `toAmount` is showing a pre-fee figure.
    const without = stubFetch({ data: ROUTE })
    const plain = await getDodoRoute({ config, request, fetchImpl: without.fetchImpl })
    expect(plain.hasConfiguredFee).toBe(false)

    const withFee = stubFetch({ data: ROUTE })
    const charged = await getDodoRoute({
      config: { ...config, feeRecipient: ACCOUNT, fee: 10 },
      request,
      fetchImpl: withFee.fetchImpl,
    })
    expect(charged.hasConfiguredFee).toBe(true)
    expect(charged.toAmount).toBe(plain.toAmount)
  })

  it('reports the reason when DODO rejects the request', async () => {
    // Failures arrive as `status: -1` with the message in `data` as a string.
    const stub = stubFetch({ status: -1, data: 'ParamsError: rebateTo' })
    await expect(
      getDodoRoute({ config, request, fetchImpl: stub.fetchImpl }),
    ).rejects.toThrow(/ParamsError: rebateTo/)
  })

  it('only simulates gas when the input needs no approval', async () => {
    const native = stubFetch({ data: ROUTE })
    await getDodoRoute({ config, request, fetchImpl: native.fetchImpl })
    expect(native.params().get('estimateGas')).toBe('true')

    // An ERC-20 route reverts during simulation until the allowance exists.
    const erc20 = stubFetch({ data: ROUTE })
    await getDodoRoute({
      config,
      request: { ...request, fromToken: { address: USDC, symbol: 'USDC', decimals: 6 } },
      fetchImpl: erc20.fetchImpl,
    })
    expect(erc20.params().get('estimateGas')).toBe('false')
  })

  it('reads the guaranteed minimum straight from minReturnAmount', async () => {
    // Already base units upstream, so scaling it again would be wrong.
    const stub = stubFetch({ data: ROUTE })
    const quote = await getDodoRoute({ config, request, fetchImpl: stub.fetchImpl })
    expect(quote.minToAmount).toBe(2_407_185_000n)
    expect(quote.priceImpact).toBeCloseTo(0.0000733)
    expect(quote.protocolFee).toEqual({ amount: 3.6472, rate: 0.0015 })
  })

  it.each([
    ['only a recipient', { feeRecipient: ACCOUNT }],
    ['only a rate', { fee: 30 }],
  ])('sends no fee parameters with %s', async (_label, partial) => {
    // DODO ignores one without the other, so sending half would quietly
    // produce a fee-free swap while the dApp believed it was earning.
    const stub = stubFetch({ data: ROUTE })
    await getDodoRoute({ config: { ...config, ...partial }, request, fetchImpl: stub.fetchImpl })

    expect(stub.params().get('rebateTo')).toBeNull()
    expect(stub.params().get('fee')).toBeNull()
  })

  it('honours slippage, source, deadline and a custom endpoint', async () => {
    const stub = stubFetch({ data: ROUTE })
    await getDodoRoute({
      config: {
        ...config,
        slippage: 0.5,
        source: 'noMaxHops',
        deadlineMinutes: 30,
        baseUrl: 'https://proxy.example/route',
      },
      request,
      fetchImpl: stub.fetchImpl,
    })

    expect(stub.calls[0]!.startsWith('https://proxy.example/route?')).toBe(true)
    expect(stub.params().get('slippage')).toBe('0.5')
    expect(stub.params().get('source')).toBe('noMaxHops')
    const seconds = Number(stub.params().get('deadLine')) - Math.floor(Date.now() / 1000)
    expect(seconds).toBeGreaterThan(29 * 60)
  })

  it('scales resAmount by the destination token decimals', async () => {
    const stub = stubFetch({ data: ROUTE })
    const quote = await getDodoRoute({ config, request, fetchImpl: stub.fetchImpl })

    // 2431.5 USDC at 6 decimals — not 2431 wei.
    expect(quote.toAmount).toBe(2_431_500_000n)
    expect(quote.toAmountFormatted).toBe('2431.5')
  })

  it('builds a sendable transaction', async () => {
    const stub = stubFetch({ data: ROUTE })
    const quote = await getDodoRoute({ config, request, fetchImpl: stub.fetchImpl })

    expect(quote.transaction).toEqual({
      to: ROUTE.to,
      data: ROUTE.data,
      value: 10n ** 18n,
      gas: 210_000n,
    })
    expect(quote.source).toBe('dodo')
  })

  it('spends through the router when no separate approval target is given', async () => {
    const stub = stubFetch({ data: ROUTE })
    const quote = await getDodoRoute({ config, request, fetchImpl: stub.fetchImpl })
    expect(quote.spender).toBe(ROUTE.to)
  })

  it('prefers targetApproveAddr when DODO names one', async () => {
    const proxy = '0x0000000000000000000000000000000000000042'
    const stub = stubFetch({ data: { ...ROUTE, targetApproveAddr: proxy } })
    const quote = await getDodoRoute({ config, request, fetchImpl: stub.fetchImpl })
    expect(quote.spender).toBe(proxy)
  })

  it('rejects a response with no route', async () => {
    const stub = stubFetch({ data: null, msg: 'no route' })
    await expect(
      getDodoRoute({ config, request, fetchImpl: stub.fetchImpl }),
    ).rejects.toThrow(/no route/)
  })

  it('rejects a failed request', async () => {
    const stub = stubFetch({}, false, 401)
    await expect(getDodoRoute({ config, request, fetchImpl: stub.fetchImpl })).rejects.toThrow(
      /401/,
    )
  })

  it('requires an API key', async () => {
    const stub = stubFetch({ data: ROUTE })
    await expect(
      getDodoRoute({ config: { apiKey: '' }, request, fetchImpl: stub.fetchImpl }),
    ).rejects.toBeInstanceOf(SwapError)
    expect(stub.calls).toHaveLength(0)
  })
})
