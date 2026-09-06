import { useCallback, useEffect, useState } from 'react'
import {
  getBalance,
  getEnsAvatar,
  getEnsName,
  signMessage,
  sendTransaction,
  type Address,
  type GetBalanceReturnType,
  type SendTransactionParameters,
  type SignMessageParameters,
} from '@web3-app-kit/core'
import type { Hash, Hex } from 'viem'

import { useConfig } from '../context.js'
import { useMutation, type Mutation } from '../internal.js'
import { useAccount } from './useAccount.js'

export type UseBalanceParameters = {
  /** Defaults to the connected account. */
  address?: Address
  chainId?: number
  /** Re-fetch on an interval, in milliseconds. Off by default. */
  refetchInterval?: number
  enabled?: boolean
}

export type UseBalanceReturnType = {
  data: GetBalanceReturnType | undefined
  error: Error | undefined
  isLoading: boolean
  refetch: () => void
}

export function useBalance(parameters: UseBalanceParameters = {}): UseBalanceReturnType {
  const config = useConfig()
  const { address: connectedAddress, chainId: connectedChainId } = useAccount()

  const address = parameters.address ?? connectedAddress
  const chainId = parameters.chainId ?? (connectedChainId === undefined ? undefined : Number(connectedChainId))
  const enabled = (parameters.enabled ?? true) && !!address

  const [data, setData] = useState<GetBalanceReturnType | undefined>(undefined)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled || !address) {
      setData(undefined)
      return
    }

    let cancelled = false
    setIsLoading(true)

    const run = () =>
      getBalance(config, { address, chainId })
        .then((result) => {
          if (cancelled) return
          setData(result)
          setError(undefined)
        })
        .catch((cause: unknown) => {
          if (cancelled) return
          setError(cause instanceof Error ? cause : new Error(String(cause)))
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false)
        })

    void run()

    if (!parameters.refetchInterval) return () => void (cancelled = true)

    const timer = setInterval(run, parameters.refetchInterval)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [config, address, chainId, enabled, nonce, parameters.refetchInterval])

  return { data, error, isLoading, refetch: useCallback(() => setNonce((n) => n + 1), []) }
}

export type UseEnsNameReturnType = { data: string | null; isLoading: boolean }

/** Reverse ENS lookup. Resolves to `null` when mainnet is not configured. */
export function useEnsName(
  parameters: { address?: Address; enabled?: boolean } = {},
): UseEnsNameReturnType {
  const config = useConfig()
  const { address: connectedAddress } = useAccount()
  const address = parameters.address ?? connectedAddress
  const enabled = parameters.enabled ?? true

  const [data, setData] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!address || !enabled) {
      setData(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    void getEnsName(config, { address })
      .then((name) => {
        if (!cancelled) setData(name)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => void (cancelled = true)
  }, [config, address, enabled])

  return { data, isLoading }
}

export function useEnsAvatar(parameters: { name?: string | null }): {
  data: string | null
  isLoading: boolean
} {
  const config = useConfig()
  const name = parameters.name
  const [data, setData] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!name) {
      setData(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    void getEnsAvatar(config, { name })
      .then((avatar) => {
        if (!cancelled) setData(avatar)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => void (cancelled = true)
  }, [config, name])

  return { data, isLoading }
}

export type UseSignMessageReturnType = Mutation<SignMessageParameters, Hex> & {
  signMessage: (parameters: SignMessageParameters) => void
  signMessageAsync: (parameters: SignMessageParameters) => Promise<Hex>
}

export function useSignMessage(): UseSignMessageReturnType {
  const config = useConfig()
  const mutation = useMutation<SignMessageParameters, Hex>(
    useCallback((parameters) => signMessage(config, parameters), [config]),
  )
  return { ...mutation, signMessage: mutation.mutate, signMessageAsync: mutation.mutateAsync }
}

export type UseSendTransactionReturnType = Mutation<SendTransactionParameters, Hash> & {
  sendTransaction: (parameters: SendTransactionParameters) => void
  sendTransactionAsync: (parameters: SendTransactionParameters) => Promise<Hash>
}

export function useSendTransaction(): UseSendTransactionReturnType {
  const config = useConfig()
  const mutation = useMutation<SendTransactionParameters, Hash>(
    useCallback((parameters) => sendTransaction(config, parameters), [config]),
  )
  return {
    ...mutation,
    sendTransaction: mutation.mutate,
    sendTransactionAsync: mutation.mutateAsync,
  }
}
