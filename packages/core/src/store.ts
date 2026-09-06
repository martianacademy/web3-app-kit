export type Store<state> = {
  getState(): state
  setState(partial: Partial<state> | ((state: state) => Partial<state>)): void
  /** Subscribe to every change. Returns an unsubscribe function. */
  subscribe(listener: (state: state, previous: state) => void): () => void
  /**
   * Subscribe to a slice. The listener only fires when the selected value
   * changes under `Object.is`, which is what keeps React renders bounded.
   */
  subscribeWith<slice>(
    selector: (state: state) => slice,
    listener: (slice: slice, previous: slice) => void,
    options?: { equalityFn?: (a: slice, b: slice) => boolean; fireImmediately?: boolean },
  ): () => void
}

export function createStore<state extends object>(initialState: state): Store<state> {
  let state = initialState
  const listeners = new Set<(state: state, previous: state) => void>()

  return {
    getState: () => state,
    setState(partial) {
      const next = typeof partial === 'function' ? partial(state) : partial
      const previous = state
      state = { ...state, ...next }
      if (Object.is(previous, state)) return
      for (const listener of [...listeners]) listener(state, previous)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    subscribeWith(selector, listener, options) {
      const equalityFn = options?.equalityFn ?? Object.is
      let current = selector(state)
      if (options?.fireImmediately) listener(current, current)
      return this.subscribe((next) => {
        const slice = selector(next)
        if (equalityFn(current, slice)) return
        const previous = current
        current = slice
        listener(slice, previous)
      })
    },
  }
}
