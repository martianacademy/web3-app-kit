import { describe, expect, it } from 'vitest'
import type { EIP1193Provider } from 'viem'

import { DETECTABLE_WALLETS, detectInjectedWallet } from '../connectors/detect.js'

const provider = (flags: Record<string, unknown>) => flags as unknown as EIP1193Provider

describe('detectInjectedWallet', () => {
  it('identifies a plain MetaMask provider', () => {
    expect(detectInjectedWallet(provider({ isMetaMask: true }))).toEqual({
      name: 'MetaMask',
      rdns: 'io.metamask',
    })
  })

  it.each([
    ['Core', { isAvalanche: true }],
    ['Rabby', { isRabby: true }],
    ['Brave Wallet', { isBraveWallet: true }],
    ['Coinbase Wallet', { isCoinbaseWallet: true }],
    ['Trust Wallet', { isTrust: true }],
    ['OKX Wallet', { isOkxWallet: true }],
    ['Rainbow', { isRainbow: true }],
    ['Zerion', { isZerion: true }],
    ['Bitget Wallet', { isBitKeep: true }],
  ])('identifies %s even though it also claims to be MetaMask', (name, flags) => {
    // Most wallets set `isMetaMask` so that dApps sniffing for MetaMask keep
    // working. Checking it first would report every one of them as MetaMask.
    expect(detectInjectedWallet(provider({ ...flags, isMetaMask: true }))?.name).toBe(name)
  })

  it('returns undefined for a provider it does not recognise', () => {
    expect(detectInjectedWallet(provider({ request: () => {} }))).toBeUndefined()
  })

  it('returns undefined when there is no provider', () => {
    expect(detectInjectedWallet(undefined)).toBeUndefined()
  })

  it('ignores flags that are present but not `true`', () => {
    expect(detectInjectedWallet(provider({ isMetaMask: 'yes' }))).toBeUndefined()
    expect(detectInjectedWallet(provider({ isRabby: false, isMetaMask: true }))?.name).toBe(
      'MetaMask',
    )
  })

  it('exposes a de-duplicated list of the wallets it knows', () => {
    expect(DETECTABLE_WALLETS).toContain('Core')
    expect(DETECTABLE_WALLETS).toContain('MetaMask')
    // Taho ships both `isTaho` and `isTally`; the list names it once.
    expect(DETECTABLE_WALLETS.filter((name) => name === 'Taho')).toHaveLength(1)
  })
})
