import { mainnet } from 'viem/chains'

import type { Config } from '../config.js'
import type { Address } from '../types.js'
import { getPublicClient } from './clients.js'

/**
 * ENS lives on Ethereum mainnet. Both helpers resolve to `null` when mainnet
 * is not part of `config.chains`, so callers never need to branch on chain.
 */
export async function getEnsName(
  config: Config,
  parameters: { address: Address },
): Promise<string | null> {
  if (!config.getChain(mainnet.id)) return null
  try {
    const client = getPublicClient(config, { chainId: mainnet.id })
    return await client.getEnsName({ address: parameters.address })
  } catch {
    return null
  }
}

export async function getEnsAvatar(
  config: Config,
  parameters: { name: string },
): Promise<string | null> {
  if (!config.getChain(mainnet.id)) return null
  try {
    const client = getPublicClient(config, { chainId: mainnet.id })
    return await client.getEnsAvatar({ name: parameters.name })
  } catch {
    return null
  }
}
