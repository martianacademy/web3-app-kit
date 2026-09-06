import { useEffect, useState } from 'react'
import type { Config, EIP1193Provider } from '@web3-app-kit/core'

/**
 * The EIP-1193 provider behind the current EVM connection.
 *
 * This is what lets the DODO widget reuse the wallet the SDK already
 * connected instead of running its own connect flow — the widget accepts a
 * `provider` prop precisely so it can be driven from outside.
 */
export function useConnectedProvider(config: Config): EIP1193Provider | undefined {
  const [provider, setProvider] = useState<EIP1193Provider | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    const sync = () => {
      const connection = config.state.connections.eip155
      if (!connection) {
        if (!cancelled) setProvider(undefined)
        return
      }
      const connector = config.getConnector(connection.connectorId)
      void connector
        ?.getProvider()
        .then((value) => {
          if (!cancelled) setProvider(value as EIP1193Provider | undefined)
        })
        .catch(() => {
          if (!cancelled) setProvider(undefined)
        })
    }

    sync()
    // The provider changes with the wallet, not just the account, so the whole
    // store is watched rather than a single field.
    const unsubscribe = config.subscribe(sync)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [config])

  return provider
}
