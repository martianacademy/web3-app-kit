import type { IconUrlOptions, WalletIconQuery } from '@web3-app-kit/chains'
import {
  connect,
  disconnect,
  getEnsAvatar,
  getEnsName,
  getBalance,
  getAccount,
  getWalletInfo,
  shortenAddress,
  switchChain,
  type ChainId,
  type ChainNamespace,
  NAMESPACE_LABELS,
  type Config,
  type Connector,
  type WalletInfo,
} from '@web3-app-kit/core'

import { escapeHtml, html, raw, safeImageUrl } from './html.js'
import { icons } from './icons.js'
import { encodeQr, qrToPath } from './qr.js'
import {
  hostThemeBridgeCss,
  styles,
  themeVariablesToCss,
  type ThemeMode,
  type ThemeVariables,
} from './theme.js'

export type ModalView =
  | 'Connect'
  | 'Qr'
  | 'Connecting'
  | 'Account'
  | 'Networks'
  | 'Receive'

/**
 * Label for a chain the config does not carry.
 *
 * Connecting to an unregistered chain is normal — the wallet decides, not the
 * dApp — and the id is the one useful thing left to show. Bare "Network" gives
 * the user nothing to recognise or search for.
 */
function unknownChainLabel(chainId: ChainId | undefined): string {
  return chainId === undefined ? 'Network' : `Chain ${String(chainId)}`
}

/** How deep each view sits, used only to pick a transition direction. */
const VIEW_DEPTH: Record<ModalView, number> = {
  Connect: 0,
  Account: 0,
  Qr: 1,
  Connecting: 1,
  Receive: 1,
  Networks: 1,
}

export type ModalState = {
  open: boolean
  view: ModalView
  /** Ecosystem the account and network views are showing. */
  namespace: ChainNamespace
  /** Connector the user is currently connecting through. */
  connectorId?: string
  /** WalletConnect pairing URI, rendered as a QR code. */
  uri?: string
  error?: string
}

export type CreateModalParameters = {
  config: Config
  themeMode?: ThemeMode
  themeVariables?: ThemeVariables
  /**
   * Adopt the host page's shadcn theme. Custom properties inherit across the
   * shadow boundary, so when this is on the modal reads `--popover`,
   * `--primary`, `--border`, `--radius` and friends straight off the page and
   * follows whatever the app's own light/dark switch is doing. Tokens the
   * page does not define keep the shadcn defaults. `themeVariables` still
   * wins over both.
   */
  inheritHostTheme?: boolean
  /** Connector ids to pin to the top of the wallet list. */
  featuredConnectorIds?: readonly string[]
  /** Shown in the modal footer. */
  termsUrl?: string
  privacyUrl?: string
  /** Element the modal is appended to. Defaults to `document.body`. */
  container?: HTMLElement
  /**
   * Chain logos in the network views, resolved from `@web3-app-kit/chains`.
   * The logo table is fetched lazily the first time a network view renders, so
   * dApps that never open one pay nothing for it.
   *
   * Pass `false` to opt out entirely, `{ sources: ['ipfs'] }` to skip the
   * third-party icon CDN, or a `gateway` / `cdnBaseUrl` to serve the images
   * from your own infrastructure.
   */
  chainIcons?: false | IconUrlOptions
  /**
   * What the Receive view's QR code encodes.
   *
   * - `address` (default) — the bare `0x…` address. Every wallet scanner
   *   understands it.
   * - `eip681` — `ethereum:0x…@<chainId>`, which carries the network too, but
   *   is not understood by every scanner.
   */
  receiveQrFormat?: 'address' | 'eip681'
  /**
   * Called when the user picks Swap in the account view.
   *
   * The modal has no swap UI of its own: DODO's widget is React and puts its
   * styles in `document.head`, so it cannot render inside this shadow root.
   * The modal closes and hands the request to you instead — see
   * `@web3-app-kit/swap-widget`. Omit this and no Swap entry appears.
   */
  onSwap?: () => void
  /**
   * Silhouette used for chain logos. `hexagon` (the default) is the shape web3
   * network badges conventionally use; `circle` and `squircle` are there when
   * it should match the rest of your product instead.
   */
  chainIconShape?: 'hexagon' | 'circle' | 'squircle'
}

export type Modal = {
  open(parameters?: { view?: ModalView }): void
  close(): void
  readonly state: ModalState
  subscribe(listener: (state: ModalState) => void): () => void
  setThemeMode(mode: ThemeMode): void
  setThemeVariables(variables: ThemeVariables): void
  setChainIconShape(shape: 'hexagon' | 'circle' | 'squircle'): void
  /**
   * Registers (or clears) the Swap handler after creation.
   *
   * The handler usually lives in React state, which does not exist yet when
   * the modal is created, so it is settable rather than create-time only. The
   * Swap entry appears and disappears with it.
   */
  setOnSwap(handler: (() => void) | undefined): void
  destroy(): void
}

const ELEMENT_NAME = 'w3ak-modal'

function defineElement() {
  if (typeof customElements === 'undefined') return
  if (customElements.get(ELEMENT_NAME)) return
  // Declared here rather than at module scope. `HTMLElement` does not exist on
  // the server, and a class extending it is evaluated on import — which made
  // simply importing this package crash any Next.js build.
  customElements.define(ELEMENT_NAME, class extends HTMLElement {})
}

export function createModal(parameters: CreateModalParameters): Modal {
  const { config } = parameters

  let state: ModalState = { open: false, view: 'Connect', namespace: 'eip155' }

  /** The connection the modal is currently showing. */
  const account = () => getAccount(config, { namespace: state.namespace })
  const listeners = new Set<(state: ModalState) => void>()

  // Async account details, refreshed whenever the Account view is shown.
  let ensName: string | null = null
  let ensAvatar: string | null = null
  let balance: string | null = null
  let walletInfo: WalletInfo | null = null
  let detailsToken = 0

  let onSwapHandler = parameters.onSwap

  let copyState: 'idle' | 'copied' | 'failed' = 'idle'
  let copyResetTimer: ReturnType<typeof setTimeout> | undefined
  let chainIconUrlsFor: ((chainId: number) => string[]) | undefined
  let chainIconsRequested = false
  let walletIconFor: ((wallet: WalletIconQuery) => string | undefined) | undefined
  let walletIconsRequested = false
  // The card's markup is replaced on every render, which would restart the
  // entrance animation. Only the first render after `open()` animates.
  let shouldAnimate = false
  /** Previous view, so a change can be animated in the direction it travelled. */
  let lastView: ModalView | undefined
  let host: HTMLElement | undefined
  let root: ShadowRoot | undefined
  let body: HTMLDivElement | undefined
  let previouslyFocused: Element | null = null
  let dismissing = false
  let dismissTimer: ReturnType<typeof setTimeout> | undefined
  let offConnectorMessage: (() => void) | undefined
  const cleanups: Array<() => void> = []

  function setState(partial: Partial<ModalState>) {
    state = { ...state, ...partial }
    for (const listener of [...listeners]) listener(state)
    render()
  }

  // -------------------------------------------------------------------------
  // Mounting

  function mount() {
    if (host || typeof document === 'undefined') return
    defineElement()

    host = document.createElement(ELEMENT_NAME)
    host.setAttribute('data-theme', parameters.themeMode ?? 'auto')
    if (parameters.chainIconShape && parameters.chainIconShape !== 'hexagon')
      host.setAttribute('chain-shape', parameters.chainIconShape)
    applyThemeVariables(parameters.themeVariables)

    root = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = styles
    body = document.createElement('div')
    body.className = 'shell'
    root.append(style, body)
    ;(parameters.container ?? document.body).append(host)
  }

  // -------------------------------------------------------------------------
  // Connector list

  type ConnectorGroup = {
    namespace: ChainNamespace
    label: string
    connectors: Connector[]
  }

  /**
   * Wallets grouped by ecosystem. Grouping is what makes a multi-chain picker
   * legible: a flat list mixes Phantom in with MetaMask and gives no hint that
   * connecting one does not replace the other.
   */
  function visibleConnectors(): ConnectorGroup[] {
    const all = [...config.connectors]
    const featured = parameters.featuredConnectorIds ?? []

    const rank = (connector: Connector) => {
      const index = featured.indexOf(connector.id)
      return index === -1 ? 1_000_000 : index
    }

    const groups: ConnectorGroup[] = []
    for (const namespace of config.getNamespaces()) {
      const discovered = all.filter(
        (connector) => connector.namespace === namespace && !!connector.rdns,
      )
      const connectors = all
        .filter((connector) => connector.namespace === namespace)
        // A generic `window.ethereum` connector duplicates whichever extension
        // won the injection race, so hide it once EIP-6963 has named them.
        .filter((connector) => !(connector.id === 'injected' && discovered.length > 0))
        // Offering a wallet that is not installed is offering a dead end: the row
        // is clickable, and clicking it can only fail. Injected and Bitcoin
        // connectors report this by probing for their provider; WalletConnect and
        // Coinbase answer true because they reach a wallet without an extension.
        // A connector that does not implement the check at all is kept — unknown
        // is not the same as absent.
        .filter((connector) => connector.isAvailable?.() !== false)
        .sort((a, b) => rank(a) - rank(b))

      if (connectors.length > 0)
        groups.push({ namespace, label: NAMESPACE_LABELS[namespace], connectors })
    }
    return groups
  }

  // -------------------------------------------------------------------------
  // Actions

  async function selectConnector(connector: Connector) {
    offConnectorMessage?.()
    offConnectorMessage = connector.emitter.on('message', ({ type, data }) => {
      if (type === 'display_uri' && typeof data === 'string') setState({ uri: data })
    })

    setState({
      namespace: connector.namespace,
      view: connector.type === 'walletConnect' ? 'Qr' : 'Connecting',
      connectorId: connector.id,
      uri: undefined,
      error: undefined,
    })

    try {
      await connect(config, { connector, chainId: account().chainId })
      close()
    } catch (error) {
      setState({
        view: 'Connecting',
        error: error instanceof Error ? error.message : 'Could not connect.',
      })
    } finally {
      offConnectorMessage?.()
      offConnectorMessage = undefined
    }
  }

  async function loadAccountDetails() {
    const token = ++detailsToken
    const { namespace } = state
    const address = account().address
    ensName = null
    ensAvatar = null
    balance = null
    walletInfo = null
    if (!address) return

    void getWalletInfo(config, { namespace })
      .then((info) => {
        if (token !== detailsToken || !info) return
        walletInfo = info
        render()
      })
      .catch(() => {})

    // Balances and ENS are EVM-only. Fetching them for a Solana or Bitcoin
    // account would show someone else's numbers next to the wrong address.
    if (namespace !== 'eip155') return

    void getBalance(config)
      .then((result) => {
        if (token !== detailsToken) return
        balance = `${result.formatted} ${result.symbol}`
        render()
      })
      .catch(() => {})

    void getEnsName(config, { address: address as `0x${string}` })
      .then(async (name) => {
        if (token !== detailsToken || !name) return
        ensName = name
        render()
        const avatar = await getEnsAvatar(config, { name })
        if (token !== detailsToken || !avatar) return
        ensAvatar = avatar
        render()
      })
      .catch(() => {})
  }

  /**
   * Pulls the chain logo table on first use. Failures are swallowed: a missing
   * logo falls back to the generic network glyph, which is not worth an error.
   */
  function ensureChainIcons() {
    if (parameters.chainIcons === false || chainIconsRequested) return
    chainIconsRequested = true
    void import('@web3-app-kit/chains')
      .then(async ({ loadChainIcons }) => {
        const icons = await loadChainIcons()
        const iconOptions = parameters.chainIcons || {}
        chainIconUrlsFor = (chainId) => icons.urls(chainId, iconOptions)
        render()
      })
      .catch(() => {})
  }

  /**
   * Pulls the bundled wallet logos. Only wallets that announce no icon of
   * their own need these, so they are fetched the first time one is rendered.
   */
  function ensureWalletIcons() {
    if (walletIconsRequested) return
    walletIconsRequested = true
    void import('@web3-app-kit/chains')
      .then(async ({ loadWalletIcons }) => {
        const icons = await loadWalletIcons()
        walletIconFor = (wallet) => icons.get(wallet)
        render()
      })
      .catch(() => {})
  }

  /** The wallet's own icon when it supplied one, otherwise a bundled logo. */
  function walletIcon(
    connector: Connector | undefined,
    info?: WalletInfo | null,
  ): string | undefined {
    const own = safeImageUrl(info?.icon ?? connector?.icon)
    if (own) return own

    ensureWalletIcons()
    return safeImageUrl(
      walletIconFor?.({
        rdns: info?.rdns ?? connector?.rdns,
        connectorId: connector?.id,
        name: info?.name ?? connector?.name,
      }),
    )
  }

  /**
   * Chain avatar: the real logo when known, the generic glyph otherwise.
   * IPFS pinning is uneven, so the remaining source URLs ride along in
   * `data-retry` and the error handler works through them.
   */
  function chainAvatar(chainId: ChainId | undefined, className = 'avatar'): string {
    // The bundled logo table is keyed by EVM chain id; other namespaces fall
    // back to the generic glyph.
    const numericChainId =
      chainId === undefined || state.namespace !== 'eip155' ? undefined : Number(chainId)
    const candidates = (numericChainId === undefined ? [] : (chainIconUrlsFor?.(numericChainId) ?? []))
      .map(safeImageUrl)
      .filter((url): url is string => !!url)

    const [first, ...rest] = candidates
    if (!first) return `<span class="${className}">${icons.network}</span>`

    return html`<span class="${raw(className)}"
      ><img
        src="${first}"
        alt=""
        loading="lazy"
        data-fallback="network"
        data-retry="${rest.join(' ')}"
    /></span>`
  }

  async function copy(text: string) {
    const ok = (await writeToClipboard(text)) || legacyCopy(text)
    copyState = ok ? 'copied' : 'failed'
    render()
    // Nothing reached the clipboard, so hand the user a selection to copy by
    // hand rather than leaving the button's promise unfulfilled.
    if (!ok) selectAddressText()

    clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(
      () => {
        copyState = 'idle'
        render()
      },
      ok ? 1400 : 2400,
    )
  }

  async function writeToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  /**
   * `navigator.clipboard` is unavailable in insecure contexts and is denied
   * outright by some embedders and permissions policies. The textarea +
   * `execCommand` path still works in most of those, and when nothing works
   * the caller reports the failure instead of claiming a successful copy.
   */
  function legacyCopy(text: string): boolean {
    if (typeof document === 'undefined') return false
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.append(textarea)
    try {
      textarea.select()
      textarea.setSelectionRange(0, text.length)
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      textarea.remove()
    }
  }

  function selectAddressText() {
    const node = body?.querySelector('.receive-address')
    const selection = typeof window === 'undefined' ? null : window.getSelection()
    if (!node || !selection) return
    const range = document.createRange()
    range.selectNodeContents(node)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  /** Label and icon for a copy button, reflecting the last attempt. */
  function copyLabel(idle: string): { icon: string; text: string } {
    if (copyState === 'copied') return { icon: icons.check, text: 'Copied' }
    if (copyState === 'failed')
      return { icon: icons.copy, text: 'Couldn\u2019t copy \u2014 select manually' }
    return { icon: icons.copy, text: idle }
  }

  // -------------------------------------------------------------------------
  // Rendering

  function render() {
    if (!host || !body) return
    // A slide-out is running on the live DOM; rebuilding it now would snap the
    // sheet back into place mid-animation.
    if (dismissing) return
    host.toggleAttribute('open', state.open)
    if (!state.open) {
      body.innerHTML = ''
      return
    }

    const view = views[state.view]()
    const animate = shouldAnimate ? ' data-animate' : ''
    // Depth, not history: going deeper slides in from the right and coming back
    // from the left, which is what the back button leads people to expect. On
    // the first render after opening, the card is already animating as a whole.
    const changed = !shouldAnimate && lastView !== undefined && lastView !== state.view
    const enter = changed
      ? VIEW_DEPTH[state.view] >= VIEW_DEPTH[lastView!]
        ? ' data-enter="forward"'
        : ' data-enter="back"'
      : ''
    shouldAnimate = false
    lastView = state.view
    body.innerHTML = html`
      <div class="overlay"${raw(animate)} part="overlay" data-close="overlay">
        <div class="card"${raw(animate)} role="dialog" aria-modal="true" aria-label="${view.title}" part="card">
          <div class="drawer-grip" part="grip">
            <div class="drawer-handle" aria-hidden="true"></div>
            <header>
            <button
              class="icon-button"
              type="button"
              data-action="back"
              ${raw(view.back ? '' : 'hidden')}
              aria-label="Back"
            >${raw(icons.back)}</button>
            <h1>${view.title}</h1>
            <button class="icon-button" type="button" data-action="close" aria-label="Close">
              ${raw(icons.close)}
            </button>
            </header>
          </div>
          <div class="body"${raw(enter)}>${raw(view.content)}</div>
          ${raw(renderFooter())}
        </div>
      </div>
    `
    wireEvents()
  }

  function renderFooter(): string {
    const { termsUrl, privacyUrl } = parameters
    if (!termsUrl && !privacyUrl) return ''
    const parts: string[] = []
    if (termsUrl) parts.push(html`<a href="${termsUrl}" target="_blank" rel="noreferrer noopener">Terms of Service</a>`)
    if (privacyUrl) parts.push(html`<a href="${privacyUrl}" target="_blank" rel="noreferrer noopener">Privacy Policy</a>`)
    return `<footer>By connecting you agree to our ${parts.join(' and ')}.</footer>`
  }

  const views: Record<ModalView, () => { title: string; content: string; back?: boolean }> = {
    Connect: () => {
      const groups = visibleConnectors()
      if (groups.length === 0)
        return {
          title: 'Connect a wallet',
          content: html`<div class="empty">
            No wallets available. Install a browser wallet, or add a WalletConnect connector to
            your config.
          </div>`,
        }

      // With one ecosystem the heading is noise; with several it is the only
      // thing telling you Phantom and MetaMask are not alternatives.
      const showLabels = groups.length > 1

      const section = (group: ConnectorGroup) => {
        const connected = config.state.connections[group.namespace]
        const label = showLabels
          ? `<div class="list-label">${escapeHtml(group.label)}${
              connected ? '<span class="tag">Connected</span>' : ''
            }</div>`
          : ''
        return label + group.connectors.map(connectorRow).join('')
      }

      return {
        title: 'Connect a wallet',
        content: html`<div class="list">${raw(groups.map(section).join(''))}</div>`,
      }
    },

    Qr: () => {
      const connector = currentConnector()
      const content = state.error
        ? statusView(connector, state.error)
        : state.uri
          ? html`<div class="qr">
              <div class="frame">
                ${raw(renderQrSvg(state.uri, 'WalletConnect pairing QR code'))}
              </div>
              <p>Scan this code with your phone's wallet app to connect.</p>
              <button class="button full" type="button" data-action="copy-uri">
                ${raw(copyLabel('Copy connection link').icon)}
                ${copyLabel('Copy connection link').text}
              </button>
            </div>`
          : html`<div class="status">
              <div class="spinner"></div>
              <h2>Preparing connection…</h2>
              <p>Generating a secure pairing code.</p>
            </div>`

      return { title: connector?.name ?? 'WalletConnect', content, back: true }
    },

    Connecting: () => {
      const connector = currentConnector()
      return {
        title: connector?.name ?? 'Connecting',
        content: statusView(connector, state.error),
        back: true,
      }
    },

    Account: () => {
      ensureChainIcons()
      const { address, chainId, chainDescriptor } = account()
      const chain = chainDescriptor
      const explorer = chain?.blockExplorerUrl
      const avatar = safeImageUrl(ensAvatar ?? undefined)

      return {
        title: 'Account',
        content: html`${raw(namespaceTabs())}
        <div class="account">
          ${raw(
            avatar
              ? html`<img class="avatar-lg" src="${avatar}" alt="" />`
              : '<div class="avatar-lg"></div>',
          )}
          <button class="address" type="button" data-action="copy-address" title="Copy address">
            ${ensName ?? shortenAddress(address ?? '')}
            <span class="check">${raw(copyState === 'copied' ? icons.check : icons.copy)}</span>
          </button>
          ${raw(
            state.namespace === 'eip155'
              ? html`<div class="balance">${balance ?? '—'}</div>`
              : '',
          )}
          ${raw(walletBadge())}
        </div>
        <div class="actions">
          <button class="button" type="button" data-action="receive">
            ${raw(icons.qr)} Receive
          </button>
          ${raw(
            onSwapHandler
              ? html`<button class="button" type="button" data-action="swap">
                  ${raw(icons.swap)} Swap
                </button>`
              : '',
          )}
          ${raw(
            explorer && address
              ? html`<a
                  class="button"
                  href="${`${explorer.replace(/\/$/, '')}/address/${address}`}"
                  target="_blank"
                  rel="noreferrer noopener"
                >${raw(icons.external)} Explorer</a>`
              // No placeholder cell: a chain with no explorer would otherwise
              // leave a hole in the grid and push Network across on its own.
              : '',
          )}
          <button class="button" type="button" data-action="networks">
            ${raw(chainAvatar(chainId, 'chain-mark'))} ${chain?.name ?? unknownChainLabel(chainId)}
          </button>
          <button class="button danger" type="button" data-action="disconnect">
            ${raw(icons.disconnect)} Disconnect
          </button>
          ${raw(
            config.getNamespaces().length > 1
              ? html`<button class="button full" type="button" data-action="add-wallet">
                  ${raw(icons.wallet)} Connect another wallet
                </button>`
              : '',
          )}
        </div>`,
      }
    },

    Receive: () => {
      ensureChainIcons()
      const { address, chainId, chainDescriptor: chain } = account()

      if (!address)
        return {
          title: 'Receive',
          back: true,
          content: html`<div class="empty">Connect a wallet to see your address.</div>`,
        }

      const payload =
        parameters.receiveQrFormat === 'eip681'
          ? `ethereum:${address}${chainId ? `@${chainId}` : ''}`
          : address

      return {
        title: 'Receive',
        back: true,
        content: html`<div class="receive">
          <div class="frame">
            ${raw(renderQrSvg(payload, `QR code for the address ${address}`, 'Q'))}
          </div>
          <div class="receive-chain">
            ${raw(chainAvatar(chainId, 'chain-mark'))}
            <span>${chain?.name ?? `Chain ${chainId ?? '?'}`}</span>
          </div>
          <code class="receive-address">${address}</code>
          <button
            class="button primary full"
            type="button"
            data-action="copy-address"
            data-copy-state="${copyState}"
          >
            ${raw(copyLabel('Copy address').icon)} ${copyLabel('Copy address').text}
          </button>
          <p class="receive-note">
            Only send assets on ${chain?.name ?? 'this network'} to this address. Funds sent on
            another network may be lost.
          </p>
        </div>`,
      }
    },

    Networks: () => {
      ensureChainIcons()
      return {
        title: 'Choose network',
        back: true,
        content: html`<div class="net-grid">
          ${raw(
            config.chains
              .map((chain) => {
                const active = chain.id === account().chainId
                return html`<button
                  class="net-tile"
                  type="button"
                  data-action="switch-chain"
                  data-chain-id="${chain.id}"
                  aria-current="${active ? 'true' : 'false'}"
                  title="${chain.name}"
                >
                  <span class="net-mark-wrap">
                    ${raw(chainAvatar(chain.id, 'net-mark'))}
                    ${raw(active ? `<span class="net-check">${icons.check}</span>` : '')}
                  </span>
                  <span class="net-name">${chain.name}</span>
                </button>`
              })
              .join(''),
          )}
        </div>`,
      }
    },
  }

  /**
   * Tabs across the connected ecosystems. Without them a second connection is
   * invisible: the account view can only show one namespace at a time, and
   * nothing else would reveal that the others exist.
   */
  function namespaceTabs(): string {
    const connected = (Object.keys(config.state.connections) as ChainNamespace[]).filter(
      (namespace) => config.state.connections[namespace],
    )
    if (connected.length < 2) return ''

    return html`<div class="ns-tabs">
      ${raw(
        connected
          .map(
            (namespace) => html`<button
              class="ns-tab"
              type="button"
              data-action="select-namespace"
              data-namespace="${namespace}"
              aria-current="${namespace === state.namespace ? 'true' : 'false'}"
            >
              ${NAMESPACE_LABELS[namespace]}
            </button>`,
          )
          .join(''),
      )}
    </div>`
  }

  /** "Connected with MetaMask", using the name and logo the wallet supplied. */
  function walletBadge(): string {
    const connector = account().connector
    const name = walletInfo?.name ?? connector?.name
    if (!name) return ''

    const icon = walletIcon(connector, walletInfo)
    return html`<div class="account-wallet">
      <span class="wallet-mark">
        ${raw(
          icon
            ? html`<img src="${icon}" alt="" data-fallback="wallet" />`
            : icons.wallet,
        )}
      </span>
      <span>${name}</span>
    </div>`
  }

  function connectorRow(connector: Connector): string {
    const icon = walletIcon(connector)
    const busy = state.connectorId === connector.id && state.view === 'Connecting'
    return html`<button
      class="row"
      type="button"
      data-action="select"
      data-connector-id="${connector.id}"
      aria-busy="${busy ? 'true' : 'false'}"
    >
      <span class="avatar">
        ${raw(
          icon
            ? html`<img src="${icon}" alt="" width="32" height="32" data-fallback="wallet" />`
            : icons.wallet,
        )}
      </span>
      <span class="name">${connector.name}</span>
      ${raw(
        busy
          ? '<span class="spinner"></span>'
          : connector.type === 'walletConnect'
            ? `<span class="tag">${escapeHtml('QR code')}</span>`
            : '',
      )}
    </button>`
  }

  function statusView(connector: Connector | undefined, error?: string): string {
    const icon = walletIcon(connector)
    return html`<div class="status">
      <div class="avatar-lg">
        ${raw(icon ? html`<img src="${icon}" alt="" data-fallback="wallet" />` : icons.wallet)}
      </div>
      ${raw(error ? '' : '<div class="spinner"></div>')}
      <h2>${error ? 'Connection failed' : `Continue in ${connector?.name ?? 'your wallet'}`}</h2>
      <p class="${error ? 'error' : ''}">
        ${error ?? 'Accept the connection request in your wallet to continue.'}
      </p>
      <div class="actions">
        <button class="button primary full" type="button" data-action="retry">Try again</button>
        ${raw(
          connector?.downloadUrl
            ? html`<a
                class="button full"
                href="${connector.downloadUrl}"
                target="_blank"
                rel="noreferrer noopener"
              >${raw(icons.download)} Get ${connector.name}</a>`
            : '',
        )}
      </div>
    </div>`
  }

  function renderQrSvg(uri: string, label: string, ecLevel: 'M' | 'Q' = 'M'): string {
    try {
      const matrix = encodeQr(uri, ecLevel)
      const quiet = 2
      const size = matrix.size + quiet * 2
      return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="${escapeHtml(label)}"><rect width="${size}" height="${size}" fill="#ffffff"/><g transform="translate(${quiet} ${quiet})" fill="#000000"><path d="${qrToPath(matrix)}"/></g></svg>`
    } catch {
      return '<div class="empty">This code is too large to display. Use the copy button.</div>'
    }
  }

  function currentConnector(): Connector | undefined {
    return state.connectorId ? config.getConnector(state.connectorId) : undefined
  }

  // -------------------------------------------------------------------------
  // Events

  function wireEvents() {
    if (!body) return

    // Remote logos (wallet icons, IPFS chain logos) can 404 or be blocked.
    // Swap in the matching glyph rather than leaving an empty box.
    for (const image of body.querySelectorAll<HTMLImageElement>('img[data-fallback]')) {
      image.addEventListener('error', () => {
        const remaining = (image.dataset.retry ?? '').split(' ').filter(Boolean)
        const next = remaining.shift()
        if (next) {
          image.dataset.retry = remaining.join(' ')
          image.src = next
          return
        }
        const glyph = image.dataset.fallback === 'network' ? icons.network : icons.wallet
        if (image.parentElement) image.parentElement.innerHTML = glyph
      })
    }

    const overlay = body.querySelector<HTMLElement>('.overlay')
    const card = body.querySelector<HTMLElement>('.card')
    const grip = body.querySelector<HTMLElement>('.drawer-grip')
    if (card && grip && overlay) attachDrag(card, grip, overlay)

    overlay?.addEventListener('mousedown', (event) => {
      if ((event.target as HTMLElement).dataset.close === 'overlay') close()
    })

    for (const element of body.querySelectorAll<HTMLElement>('[data-action]')) {
      const action = element.dataset.action!
      element.addEventListener('click', (event) => {
        switch (action) {
          case 'close':
            close()
            break
          case 'back': {
            // Sub-views return to the view that opened them; everything else
            // falls back to the account, or the wallet list when there is
            // nothing connected.
            const parents: Partial<Record<ModalView, ModalView>> = {
              Networks: 'Account',
            }
            const target =
              parents[state.view] ?? (account().isConnected ? 'Account' : 'Connect')
            setState({ view: target, error: undefined, uri: undefined })
            break
          }
          case 'select': {
            const connector = config.getConnector(element.dataset.connectorId!)
            if (connector) void selectConnector(connector)
            break
          }
          case 'retry': {
            const connector = currentConnector()
            if (connector) void selectConnector(connector)
            break
          }
          case 'copy-uri':
            if (state.uri) void copy(state.uri)
            break
          case 'copy-address':
            {
              const address = account().address
              if (address) void copy(address)
            }
            break
          case 'networks':
            setState({ view: 'Networks' })
            break
          case 'add-wallet':
            setState({ view: 'Connect' })
            break
          case 'select-namespace': {
            const namespace = element.dataset.namespace as ChainNamespace | undefined
            if (namespace) {
              setState({ namespace, view: 'Account' })
              void loadAccountDetails()
            }
            break
          }
          case 'receive':
            setState({ view: 'Receive' })
            break
          case 'swap':
            // Closed without the drawer's slide-out. The swap sheet takes this
            // one's place and slides in from the side, the same way Receive and
            // Networks do; animating this one downwards first would read as two
            // separate sheets instead of one changing view.
            finishClose()
            onSwapHandler?.()
            break
          case 'switch-chain': {
            const chainId = Number(element.dataset.chainId)
            void switchChain(config, { chainId })
              .then(() => {
                setState({ view: 'Account' })
              })
              .catch((error: unknown) =>
                setState({
                  error: error instanceof Error ? error.message : 'Could not switch network.',
                }),
              )
            break
          }
          case 'disconnect':
            void disconnect(config, { namespace: state.namespace }).then(() => {
              // Other ecosystems may still be connected; stay open on them.
              const remaining = Object.keys(config.state.connections) as ChainNamespace[]
              if (remaining.length > 0) setState({ namespace: remaining[0]!, view: 'Account' })
              else close()
            })
            break
          default:
            break
        }
        event.preventDefault()
      })
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!state.open) return
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab' || !body) return

    // Basic focus trap: the modal lives in a shadow root, so Tab would
    // otherwise walk out into the page behind the overlay.
    const focusable = [
      ...body.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])'),
    ].filter((element) => !element.hasAttribute('hidden'))
    if (focusable.length === 0) return

    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    const active = root?.activeElement as HTMLElement | null

    if (event.shiftKey && (active === first || !active)) {
      last.focus()
      event.preventDefault()
    } else if (!event.shiftKey && active === last) {
      first.focus()
      event.preventDefault()
    }
  }


  // ---------------------------------------------------------------------------
  // Drawer

  /** Below this width the dialog becomes a bottom sheet. Matches Tailwind `sm`. */
  const DRAWER_QUERY = '(max-width: 639px)'

  function isDrawer(): boolean {
    return typeof window !== 'undefined' && window.matchMedia(DRAWER_QUERY).matches
  }

  function prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  }

  /**
   * Swipe-down to dismiss, from the handle and header only. Dragging from the
   * body as well would mean fighting the scroll container for every gesture,
   * and a sheet that steals scrolls is worse than one with a smaller grip.
   */
  function attachDrag(card: HTMLElement, grip: HTMLElement, overlay: HTMLElement) {
    let active = false
    let startY = 0
    let startTime = 0
    let offset = 0

    const onDown = (event: PointerEvent) => {
      if (!isDrawer() || event.button !== 0) return
      if ((event.target as HTMLElement).closest('button, a')) return
      active = true
      startY = event.clientY
      startTime = event.timeStamp
      offset = 0
      card.style.transition = 'none'
      grip.setPointerCapture(event.pointerId)
    }

    const onMove = (event: PointerEvent) => {
      if (!active) return
      const delta = event.clientY - startY
      // Upward drags are resisted rather than blocked, so the sheet still
      // reacts to the finger instead of feeling stuck.
      offset = delta > 0 ? delta : delta / 4
      card.style.transform = `translateY(${offset}px)`
      overlay.style.opacity = String(Math.max(0.3, 1 - offset / (card.offsetHeight || 1)))
    }

    const onUp = (event: PointerEvent) => {
      if (!active) return
      active = false
      grip.releasePointerCapture?.(event.pointerId)

      const elapsed = Math.max(1, event.timeStamp - startTime)
      const velocity = offset / elapsed
      // A short flick counts as a dismiss even when the sheet barely moved.
      if (offset > (card.offsetHeight || 0) * 0.35 || velocity > 0.5) {
        slideOut(card, overlay)
        return
      }

      card.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)'
      card.style.transform = ''
      overlay.style.opacity = ''
    }

    grip.addEventListener('pointerdown', onDown)
    grip.addEventListener('pointermove', onMove)
    grip.addEventListener('pointerup', onUp)
    grip.addEventListener('pointercancel', onUp)
  }

  function slideOut(card: HTMLElement, overlay: HTMLElement) {
    dismissing = true
    card.style.transition = 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)'
    card.style.transform = 'translateY(100%)'
    overlay.style.transition = 'opacity 220ms ease-out'
    overlay.style.opacity = '0'
    dismissTimer = setTimeout(finishClose, 220)
  }

  // -------------------------------------------------------------------------
  // Public surface

  /** Bridge first, explicit overrides second, so `themeVariables` always wins. */
  function applyThemeVariables(variables: ThemeVariables | undefined) {
    if (!host) return
    const inline = [
      parameters.inheritHostTheme ? hostThemeBridgeCss() : '',
      themeVariablesToCss(variables),
    ]
      .filter(Boolean)
      .join(' ')
    if (inline) host.setAttribute('style', inline)
    else host.removeAttribute('style')
  }

  function open(options: { view?: ModalView } = {}) {
    mount()
    // Reopening mid-dismiss must not leave the sheet translated off-screen.
    clearTimeout(dismissTimer)
    dismissTimer = undefined
    dismissing = false
    // Land on the account view only when something is connected; otherwise the
    // wallet list, which is also how a second ecosystem gets connected.
    const connections = Object.keys(config.state.connections) as ChainNamespace[]
    const namespace = connections.includes(state.namespace)
      ? state.namespace
      : (connections[0] ?? 'eip155')
    // Account-only views are meaningless without a wallet, so they fall back
    // to the wallet list rather than rendering an empty shell.
    const needsWallet: readonly ModalView[] = ['Account', 'Receive', 'Networks']
    const requested = options.view ?? (connections.length > 0 ? 'Account' : 'Connect')
    const view =
      connections.length === 0 && needsWallet.includes(requested) ? 'Connect' : requested

    state = { ...state, namespace }

    previouslyFocused = document.activeElement
    shouldAnimate = true
    document.documentElement.style.setProperty('overflow', 'hidden')
    setState({ open: true, view, error: undefined, uri: undefined })
    if (view === 'Account') void loadAccountDetails()

    requestAnimationFrame(() => {
      body?.querySelector<HTMLElement>('.row, .button, .icon-button')?.focus()
    })
  }

  function close() {
    if (!state.open || dismissing) return

    const card = body?.querySelector<HTMLElement>('.card')
    const overlay = body?.querySelector<HTMLElement>('.overlay')
    if (isDrawer() && !prefersReducedMotion() && card && overlay) {
      slideOut(card, overlay)
      return
    }
    finishClose()
  }

  function finishClose() {
    clearTimeout(dismissTimer)
    dismissTimer = undefined
    dismissing = false
    offConnectorMessage?.()
    offConnectorMessage = undefined
    clearTimeout(copyResetTimer)
    copyState = 'idle'
    lastView = undefined
    document.documentElement.style.removeProperty('overflow')
    setState({ open: false, connectorId: undefined, uri: undefined, error: undefined })
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    previouslyFocused = null
  }

  if (typeof document !== 'undefined') {
    mount()
    document.addEventListener('keydown', onKeyDown, true)
    cleanups.push(() => document.removeEventListener('keydown', onKeyDown, true))
  }

  cleanups.push(
    config.subscribe((next, previous) => {
      if (!state.open) return
      const ns: ChainNamespace = state.namespace
      const status = next.statuses[ns as ChainNamespace]
      const wasStatus = previous.statuses[ns as ChainNamespace]

      if (status === 'connected' && wasStatus !== 'connected') {
        setState({ view: 'Account' })
        void loadAccountDetails()
        return
      }
      if (status === 'disconnected' && wasStatus === 'connected') {
        setState({ view: 'Connect' })
        return
      }
      const connection = next.connections[ns as ChainNamespace]
      const before = previous.connections[ns as ChainNamespace]
      if (connection?.address !== before?.address || connection?.chainId !== before?.chainId)
        void loadAccountDetails()
      render()
    }),
  )

  cleanups.push(config.subscribeConnectors(() => render()))
  cleanups.push(config.subscribeChains(() => render()))

  return {
    open,
    close,
    get state() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    setThemeMode(mode) {
      host?.setAttribute('data-theme', mode)
    },
    setThemeVariables(variables) {
      applyThemeVariables(variables)
    },
    setChainIconShape(shape) {
      if (shape === 'hexagon') host?.removeAttribute('chain-shape')
      else host?.setAttribute('chain-shape', shape)
    },
    setOnSwap(handler) {
      onSwapHandler = handler
      render()
    },
    destroy() {
      clearTimeout(copyResetTimer)
      clearTimeout(dismissTimer)
      cleanups.forEach((fn) => fn())
      cleanups.length = 0
      listeners.clear()
      host?.remove()
      host = undefined
      root = undefined
      body = undefined
    },
  }
}
