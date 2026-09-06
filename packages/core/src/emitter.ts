import type { ConnectorEmitter, ConnectorEventMap } from './types.js'

type Listener = (payload: any) => void

/**
 * Minimal typed event emitter. Listeners are isolated: one throwing listener
 * does not prevent the rest from running, because a broken UI subscriber must
 * never break a wallet connection.
 */
export function createEmitter(onError?: (error: unknown) => void): ConnectorEmitter {
  const listeners = new Map<keyof ConnectorEventMap, Set<Listener>>()

  return {
    emit(event, payload) {
      const set = listeners.get(event)
      if (!set) return
      for (const listener of [...set]) {
        try {
          listener(payload)
        } catch (error) {
          onError?.(error)
        }
      }
    },
    on(event, listener) {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(listener as Listener)
      return () => {
        set!.delete(listener as Listener)
      }
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener as Listener)
    },
  }
}
