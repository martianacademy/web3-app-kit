import { describe, expect, it } from 'vitest'

import { DEFAULT_TOKEN_ICON_CDN, loadTokenIcons, tokenIconUrl } from './index.js'

const USDC_ETHEREUM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const NOT_A_TOKEN = '0x000000000000000000000000000000000000dEaD'

describe('loadTokenIcons', () => {
  it('parses once and reuses the result', async () => {
    const a = await loadTokenIcons()
    const b = await loadTokenIcons()
    expect(a).toBe(b)
    expect(a.size).toBeGreaterThan(1500)
  })

  it('resolves a token by chain and address', async () => {
    const icons = await loadTokenIcons()
    expect(icons.get({ chainId: 1, address: USDC_ETHEREUM })).toEqual({
      id: 'USDC',
      symbol: 'USDC',
    })
  })

  it('matches the same token on another chain', async () => {
    const icons = await loadTokenIcons()
    expect(icons.get({ chainId: 8453, address: USDC_BASE })?.id).toBe('USDC')
  })

  it('is case-insensitive and tolerates a missing 0x prefix', async () => {
    const icons = await loadTokenIcons()
    expect(icons.get({ chainId: 1, address: USDC_ETHEREUM.toLowerCase() })?.id).toBe('USDC')
    expect(icons.get({ chainId: 1, address: USDC_ETHEREUM.slice(2) })?.id).toBe('USDC')
  })

  it('never falls back to the symbol when an address was given', async () => {
    const icons = await loadTokenIcons()
    // A counterfeit can call itself whatever it likes; an unknown address is
    // an unknown token, so this must not hand back USDC's mark.
    expect(
      icons.get({ chainId: 1, address: NOT_A_TOKEN, symbol: 'USDC' }),
    ).toBeUndefined()
    expect(icons.url({ chainId: 1, address: NOT_A_TOKEN, symbol: 'USDC' })).toBeUndefined()
  })

  it('resolves by symbol when no address is known', async () => {
    const icons = await loadTokenIcons()
    expect(icons.get({ symbol: 'usdc' })?.id).toBe('USDC')
    expect(icons.get({ symbol: 'definitely-not-a-ticker' })).toBeUndefined()
  })

  it('builds a pinned CDN url', async () => {
    const icons = await loadTokenIcons()
    const url = icons.url({ chainId: 1, address: USDC_ETHEREUM })!

    expect(url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/gh\/0xa3k5\/web3icons@[0-9a-f]{40}\//)
    expect(url).toMatch(/\/svgs\/tokens\/branded\/USDC\.svg$/)
    // Pinned to a commit, never a moving branch.
    expect(url).not.toContain('@main')
  })

  it('supports variants and a self-hosted mirror', async () => {
    const icons = await loadTokenIcons()

    expect(icons.url({ symbol: 'USDC' }, { variant: 'mono' })).toMatch(/\/mono\/USDC\.svg$/)
    expect(icons.url({ symbol: 'USDC' }, { baseUrl: 'https://my.cdn/tokens/' })).toBe(
      'https://my.cdn/tokens/branded/USDC.svg',
    )
  })

  it('returns nothing for an empty query', async () => {
    const icons = await loadTokenIcons()
    expect(icons.get({})).toBeUndefined()
    expect(icons.url({})).toBeUndefined()
  })
})

describe('tokenIconUrl', () => {
  it('encodes ids that are not url-safe', () => {
    expect(tokenIconUrl({ id: 'A/B', symbol: 'AB' })).toContain('/A%2FB.svg')
  })

  it('returns undefined without an icon', () => {
    expect(tokenIconUrl(undefined)).toBeUndefined()
  })

  it('falls back to the default CDN template', () => {
    expect(tokenIconUrl({ id: 'USDC', symbol: 'USDC' })).toBe(
      `${DEFAULT_TOKEN_ICON_CDN}/branded/USDC.svg`,
    )
  })
})
