import type { Storage } from './types.js'

/** Storage that keeps nothing. Used on the server and when `localStorage` is blocked. */
export function noopStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }
}

/**
 * `localStorage` behind a namespace prefix, degrading to an in-memory map when
 * the browser denies access (Safari private mode, blocked third-party frames).
 */
export function createStorage(parameters: { key?: string; storage?: Storage } = {}): Storage {
  const prefix = parameters.key ?? 'w3ak'
  const base = parameters.storage ?? defaultBrowserStorage()
  const scoped = (key: string) => `${prefix}.${key}`

  return {
    getItem(key) {
      try {
        return base.getItem(scoped(key))
      } catch {
        return null
      }
    },
    setItem(key, value) {
      try {
        base.setItem(scoped(key), value)
      } catch {
        /* quota exceeded or access denied — persistence is best-effort */
      }
    },
    removeItem(key) {
      try {
        base.removeItem(scoped(key))
      } catch {
        /* see above */
      }
    },
  }
}

function defaultBrowserStorage(): Storage {
  if (typeof window === 'undefined') return noopStorage()
  try {
    const probe = '__w3ak_probe__'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return memoryStorage()
  }
}

/** In-memory storage. Exported for tests and for explicitly opting out of persistence. */
export function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}
