// @vitest-environment node
//
// The point of this file is the environment line above: no DOM globals at all,
// the way a Next.js server render sees the world. `@web3-app-kit/ui@0.1.0`
// shipped a `class extends HTMLElement` at module scope, which made merely
// importing this package throw `ReferenceError: HTMLElement is not defined`
// and crash the build of any app that server-renders.
import { describe, expect, it } from 'vitest'

describe('server-side rendering', () => {
  it('has no DOM globals in this environment', () => {
    // Guards the guard: if a future config gives this file a DOM, every
    // assertion below would pass while proving nothing.
    expect(typeof globalThis.HTMLElement).toBe('undefined')
    expect(typeof globalThis.document).toBe('undefined')
    expect(typeof globalThis.customElements).toBe('undefined')
  })

  it('imports without touching a browser global', async () => {
    await expect(import('./index.js')).resolves.toBeDefined()
  })

  it('can build a modal without a DOM, deferring every browser call to open()', async () => {
    const { createModal } = await import('./modal.js')
    const config = {
      chains: [],
      state: { connections: {}, pending: {}, statuses: {}, chainIds: {}, errors: {} },
      subscribe: () => () => {},
      subscribeChains: () => () => {},
      subscribeConnectors: () => () => {},
      getConnector: () => undefined,
      getNamespaces: () => [],
      connectors: [],
    }

    // Constructing must not reach for `document`; only `open()` may, and that
    // is never called on the server.
    expect(() => createModal({ config } as never)).not.toThrow()
  })

  it('exports its stylesheet as a plain string, usable anywhere', async () => {
    const { styles } = await import('./theme.js')
    expect(typeof styles).toBe('string')
    expect(styles.length).toBeGreaterThan(0)
  })
})
