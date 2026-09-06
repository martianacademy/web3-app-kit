import { useCallback, useEffect, useState } from 'react'
import {
  getAccount,
  getChainId,
  getWalletInfo,
  type Config,
  type Connector,
  type GetAccountReturnType,
  type WalletInfo,
} from '@web3-app-kit/core'

import { useConfig } from '../context.js'
import { useConfigValue } from '../internal.js'

/** The connected account, chain and connection status. */
export function useAccount(): GetAccountReturnType {
  return useConfigValue(useConfig(), getAccount)
}

/** The chain the wallet is currently on (or the default chain when disconnected). */
export function useChainId(): number {
  return useConfigValue(useConfig(), getChainId, Object.is)
}

/** Every registered connector, including wallets found by EIP-6963 discovery. */
export function useConnectors(): readonly Connector[] {
  const config = useConfig()
  const [connectors, setConnectors] = useState<readonly Connector[]>(() => config.connectors)

  useEffect(() => {
    setConnectors(config.connectors)
    return config.subscribeConnectors((next) => setConnectors(next))
  }, [config])

  return connectors
}

export type UseWalletInfoReturnType = {
  data: WalletInfo | undefined
  isLoading: boolean
}

/**
 * Which wallet the user is actually connected through — MetaMask, Core,
 * Rainbow — with the name and logo the wallet itself supplies.
 *
 * An EIP-6963 wallet announces both; a WalletConnect session carries the peer
 * wallet's metadata, so this resolves to the real wallet rather than
 * "WalletConnect"; a wallet that only takes over `window.ethereum` is named
 * from its provider flags, and has no logo to give.
 */
export function useWalletInfo(): UseWalletInfoReturnType {
  const config = useConfig()
  const { connector, status } = useAccount()
  const [data, setData] = useState<WalletInfo | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (status !== 'connected') {
      setData(undefined)
      return
    }
    let cancelled = false
    setIsLoading(true)
    void getWalletInfo(config)
      .then((info) => {
        if (!cancelled) setData(info)
      })
      .catch(() => {
        if (!cancelled) setData(undefined)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => void (cancelled = true)
  }, [config, connector, status])

  return { data, isLoading }
}

/** Escape hatch for reading arbitrary slices of config state. */
export function useConfigSelector<value>(
  select: (config: Config) => value,
  equal?: (a: value, b: value) => boolean,
): value {
  const config = useConfig()
  const stable = useCallback(select, [select])
  return useConfigValue(config, stable, equal)
}
