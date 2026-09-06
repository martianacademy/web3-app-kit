import { formatUnits, type Hash, type Hex } from 'viem'

import type { Config } from '../config.js'
import type { Address } from '../types.js'
import { getPublicClient, getWalletClient } from './clients.js'

export type SignMessageParameters = {
  message: string | { raw: Hex | Uint8Array }
  account?: Address
}

export async function signMessage(
  config: Config,
  parameters: SignMessageParameters,
): Promise<Hex> {
  const client = await getWalletClient(config, { account: parameters.account })
  return client.signMessage({
    account: client.account!,
    message: parameters.message,
  })
}

export type SendTransactionParameters = {
  to: Address
  value?: bigint
  data?: Hex
  chainId?: number
  gas?: bigint
}

export async function sendTransaction(
  config: Config,
  parameters: SendTransactionParameters,
): Promise<Hash> {
  const client = await getWalletClient(config, { chainId: parameters.chainId })
  return client.sendTransaction({
    account: client.account!,
    chain: client.chain ?? null,
    to: parameters.to,
    value: parameters.value,
    data: parameters.data,
    gas: parameters.gas,
  })
}

export type GetBalanceParameters = {
  address?: Address
  chainId?: number
}

export type GetBalanceReturnType = {
  value: bigint
  decimals: number
  symbol: string
  /** Human-readable amount, e.g. `"1.2345"`. */
  formatted: string
}

export async function getBalance(
  config: Config,
  parameters: GetBalanceParameters = {},
): Promise<GetBalanceReturnType> {
  const address = parameters.address ?? (config.state.connections.eip155?.address as Address)
  if (!address) throw new Error('`getBalance` needs an address or a connected account.')

  const chainId =
    parameters.chainId ?? Number(config.state.chainIds.eip155 ?? config.chains[0].id)
  const client = getPublicClient(config, { chainId })
  const value = await client.getBalance({ address })
  const currency = config.getChain(chainId)?.nativeCurrency

  const decimals = currency?.decimals ?? 18
  return {
    value,
    decimals,
    symbol: currency?.symbol ?? 'ETH',
    formatted: trimDecimals(formatUnits(value, decimals), 4),
  }
}

function trimDecimals(value: string, places: number): string {
  const [whole, fraction] = value.split('.')
  if (!fraction) return whole ?? value
  const trimmed = fraction.slice(0, places).replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : (whole ?? '0')
}
