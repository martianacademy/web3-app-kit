import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublicClient, WalletClient } from 'viem'
import { getPublicClient, getWalletClient } from '@web3-app-kit/core'
import type { ModalView } from '@web3-app-kit/ui'

import { useConfig, useWeb3AppKitContext } from '../context.js'
import { useAccount } from './useAccount.js'

export type UseAppKitReturnType = {
  /** Opens the modal. Defaults to the account view when already connected. */
  open: (parameters?: { view?: ModalView }) => void
  close: () => void
  isOpen: boolean
  /** `false` on the server and when the provider was given `modal={false}`. */
  isReady: boolean
}

/** Controls the built-in wallet modal. */
export function useAppKit(): UseAppKitReturnType {
  const { modal } = useWeb3AppKitContext()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!modal) {
      setIsOpen(false)
      return
    }
    setIsOpen(modal.state.open)
    return modal.subscribe((state) => setIsOpen(state.open))
  }, [modal])

  return {
    open: useCallback((parameters) => modal?.open(parameters), [modal]),
    close: useCallback(() => modal?.close(), [modal]),
    isOpen,
    isReady: !!modal,
  }
}

/**
 * Registers the handler behind the modal's Swap entry.
 *
 * The modal has no swap UI of its own — the widget that provides one is React
 * and cannot render inside the modal's shadow root — so it closes and calls
 * this instead. The Swap entry only appears while a handler is registered.
 */
export function useSwapRequest(handler: (() => void) | undefined): void {
  const { modal } = useWeb3AppKitContext()
  // Kept in a ref so an inline arrow does not re-register on every render.
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    if (!modal) return
    modal.setOnSwap(handler ? () => latest.current?.() : undefined)
    return () => modal.setOnSwap(undefined)
  }, [modal, !handler])
}

/** Read-only viem client for the given chain. */
export function usePublicClient(parameters: { chainId?: number } = {}): PublicClient | undefined {
  const config = useConfig()
  const { chainId: connectedChainId } = useAccount()
  const chainId = parameters.chainId ?? connectedChainId

  try {
    return getPublicClient(config, chainId ? { chainId: Number(chainId) } : {})
  } catch {
    // The chain is not in `config.chains` — callers treat this as "no client".
    return undefined
  }
}

/** Signing viem client for the connected wallet. `undefined` while disconnected. */
export function useWalletClient(parameters: { chainId?: number } = {}): {
  data: WalletClient | undefined
  isLoading: boolean
} {
  const config = useConfig()
  const { address, chainId: connectedChainId, isConnected } = useAccount()
  const chainId = parameters.chainId ?? connectedChainId

  const [data, setData] = useState<WalletClient | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!isConnected) {
      setData(undefined)
      return
    }
    let cancelled = false
    setIsLoading(true)
    void getWalletClient(config, chainId ? { chainId: Number(chainId) } : {})
      .then((client) => {
        if (!cancelled) setData(client)
      })
      .catch(() => {
        if (!cancelled) setData(undefined)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => void (cancelled = true)
  }, [config, address, chainId, isConnected])

  return { data, isLoading }
}
