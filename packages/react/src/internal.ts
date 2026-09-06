import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { Config } from '@web3-app-kit/core'

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const aKeys = Object.keys(a as object)
  const bKeys = Object.keys(b as object)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) =>
    Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  )
}

/**
 * Subscribes to the config store and re-renders only when `select` produces a
 * value that is not `equal` to the previous one. The snapshot is cached so
 * `useSyncExternalStore` sees a stable reference between unrelated updates.
 */
export function useConfigValue<value>(
  config: Config,
  select: (config: Config) => value,
  equal: (a: value, b: value) => boolean = shallowEqual,
): value {
  const cache = useRef<{ value: value } | null>(null)

  const getSnapshot = useCallback(() => {
    const next = select(config)
    if (cache.current && equal(cache.current.value, next)) return cache.current.value
    cache.current = { value: next }
    return next
  }, [config, select, equal])

  const subscribe = useCallback(
    (onStoreChange: () => void) => config.subscribe(onStoreChange),
    [config],
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export type MutationState<data> = {
  data: data | undefined
  error: Error | undefined
  isPending: boolean
  isSuccess: boolean
  isError: boolean
}

export type Mutation<variables, data> = MutationState<data> & {
  /** Fire and forget. Errors land in `error` instead of rejecting. */
  mutate: (variables: variables) => void
  /** Resolves with the result, rejects on failure. */
  mutateAsync: (variables: variables) => Promise<data>
  reset: () => void
}

const IDLE = {
  data: undefined,
  error: undefined,
  isPending: false,
  isSuccess: false,
  isError: false,
} as const

/** Minimal mutation state machine so the package stays free of a query library. */
export function useMutation<variables, data>(
  mutationFn: (variables: variables) => Promise<data>,
): Mutation<variables, data> {
  const [state, setState] = useState<MutationState<data>>(IDLE)
  const mounted = useMountedRef()
  const fnRef = useRef(mutationFn)
  fnRef.current = mutationFn

  const mutateAsync = useCallback(
    async (variables: variables) => {
      setState({ ...IDLE, isPending: true })
      try {
        const data = await fnRef.current(variables)
        if (mounted.current)
          setState({ data, error: undefined, isPending: false, isSuccess: true, isError: false })
        return data
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error))
        if (mounted.current)
          setState({
            data: undefined,
            error: normalized,
            isPending: false,
            isSuccess: false,
            isError: true,
          })
        throw normalized
      }
    },
    [mounted],
  )

  const mutate = useCallback(
    (variables: variables) => {
      void mutateAsync(variables).catch(() => {})
    },
    [mutateAsync],
  )

  const reset = useCallback(() => setState(IDLE), [])

  return { ...state, mutate, mutateAsync, reset }
}

function useMountedRef() {
  const mounted = useRef(true)
  useIsomorphicEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

/** `useLayoutEffect` warns during SSR; fall back to `useEffect` there. */
export const useIsomorphicEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
