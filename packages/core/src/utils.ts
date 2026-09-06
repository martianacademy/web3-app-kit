import type { Address, Chain } from 'viem'

/** Providers return chain ids as hex strings, decimal strings, or numbers. */
export function normalizeChainId(chainId: string | number | bigint | unknown): number {
  if (typeof chainId === 'number') return chainId
  if (typeof chainId === 'bigint') return Number(chainId)
  if (typeof chainId === 'string')
    return Number.parseInt(chainId, chainId.trim().startsWith('0x') ? 16 : 10)
  throw new TypeError(`Cannot normalize chain id: ${String(chainId)}`)
}

export function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}` as const
}

export function getChain(chains: readonly Chain[], chainId: number): Chain | undefined {
  return chains.find((chain) => chain.id === chainId)
}

/** `0x1234…abcd` — the form the modal and most dApps display. */
export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`
}

export function isAddressEqual(a?: string, b?: string): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}

export function uniqueAddresses(accounts: readonly string[]): readonly Address[] {
  const seen = new Set<string>()
  const result: Address[] = []
  for (const account of accounts) {
    const key = account.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(account as Address)
  }
  return result
}

export function deepEqualAccounts(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((value, index) => value.toLowerCase() === b[index]?.toLowerCase())
}
