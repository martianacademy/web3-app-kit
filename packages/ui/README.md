# @web3-app-kit/ui

The wallet-connection modal for [web3-app-kit](https://github.com/), shipped as
a web component. The QR encoder is written in-package, so the only dependency
is the chain dataset used for network logos — and that is loaded lazily.

```bash
npm install @web3-app-kit/ui @web3-app-kit/core viem
```

## Usage

```ts
import { createConfig, injected } from '@web3-app-kit/core'
import { mainnet } from '@web3-app-kit/core/chains'
import { createModal } from '@web3-app-kit/ui'

const config = createConfig({ chains: [mainnet], connectors: [injected()] })
const modal = createModal({ config, themeMode: 'auto' })

modal.open()                      // account view when connected, wallet list otherwise
modal.open({ view: 'Networks' })  // jump straight to the network picker
modal.close()
```

## Views

`Connect` (wallet list, grouped into installed and other) · `Qr`
(WalletConnect pairing code) · `Connecting` (with retry and install link) ·
`Account` (ENS name and avatar, balance, the connected wallet's name and logo,
explorer link, disconnect) ·
`Receive` (address QR, address and copy button) · `Networks` (a grid of large
hexagonal chain marks, three per row, with the current one badged).

Open any of them directly:

```ts
modal.open({ view: 'Receive' })
```

### Receive

The Receive view renders a QR of the connected address, the address itself in
a selectable monospace block, a one-press copy button, and the network the
address is being shown for — sending on the wrong chain is the expensive
mistake this view exists to prevent.

The QR encodes the bare `0x…` address by default, which every wallet scanner
understands. Set `receiveQrFormat: 'eip681'` to encode
`ethereum:0x…@<chainId>` instead, which carries the network but is not
understood everywhere.

The code surface stays light in both themes on purpose: inverted QR codes fall
outside what ISO/IEC 18004 assumes and plenty of scanners refuse them, so a
code that always scans beats one that matches dark mode.

### Chain marks

Chain logos are cut to a rounded pointy-top hexagon — the silhouette web3
network badges conventionally use — with a CSS mask, so it applies to the
remote logo without touching the image itself. Switch it at any time:

```ts
createModal({ config, chainIconShape: 'circle' })  // or 'squircle'
modal.setChainIconShape('hexagon')
```

The "current network" badge sits on the hexagon's flat right edge rather than
the bottom-right corner, which on this shape is a diagonal the badge would
float off; it moves back to the corner for the round shapes.

### Copying

`navigator.clipboard` is unavailable in insecure contexts and is denied
outright by some embedders and permissions policies. Copy buttons fall back to
a `textarea` + `execCommand('copy')` path, and when neither works they say so
and select the address for you instead of claiming a copy that never happened.

Chain logos are pulled from `@web3-app-kit/chains` the first time a network
view renders, so a dApp that never opens one downloads nothing extra. Public
gateways pin the images unevenly, so each logo carries its remaining source
URLs and the modal advances through them on error before falling back to a
generic glyph.

## Options

| Option | Description |
| --- | --- |
| `themeMode` | `'light'`, `'dark'` or `'auto'` (follows the OS). |
| `inheritHostTheme` | Read the host page's shadcn variables. See below. |
| `themeVariables` | `primary`, `accent`, `muted`, `border`, `ring`, `radius`, `fontFamily`, … |
| `chainIconShape` | `'hexagon'` (default), `'circle'` or `'squircle'`. |
| `chainIcons` | Network logos. `false` disables them, `{ sources: ['ipfs'] }` skips the third-party CDN, `{ gateway, cdnBaseUrl }` points at your own. |
| `receiveQrFormat` | `'address'` (default) or `'eip681'`. What the Receive QR encodes. |
| `featuredConnectorIds` | Connector ids pinned to the top of the list. |
| `termsUrl` / `privacyUrl` | Rendered in the footer. |
| `container` | Where to mount. Defaults to `document.body`. |

## Theming

The modal is shadcn/ui's default (neutral) theme, hand-translated to plain CSS:
the same semantic tokens, the same radius scale, the same button and dialog
shapes. Every colour is declared twice — a hex fallback, then the `oklch()`
value shadcn ships — so browsers without `oklch()` render the identical sRGB
colour.

```ts
createModal({ config, inheritHostTheme: true })
```

With `inheritHostTheme`, the modal maps its tokens onto the page's `--popover`,
`--primary`, `--accent`, `--border`, `--ring` and `--radius`. Custom properties
inherit across the shadow boundary, so a shadcn app gets a matching modal that
follows its own `.dark` toggle, with no configuration and no duplicated theme.
Tokens the page does not define keep shadcn's defaults, and `themeVariables`
overrides both.

The modal lives in a shadow root, so your application stylesheet cannot leak
into it — and it cannot leak out. `::part(overlay)` and `::part(card)` are
exposed for the rest.

## Small screens

Below 640px (Tailwind's `sm`) the dialog becomes a bottom sheet: full width,
flush to the bottom edge, rounded on top only, with a drag handle. It slides
up on open, slides down on close, and can be swiped away — the sheet follows
your finger, the backdrop fades with it, and a drag past 35% of its height or
a quick flick dismisses it; anything shorter springs back.

This is shadcn's Drawer, rebuilt in plain CSS and pointer events. shadcn's own
Drawer is a React component built on Vaul, and this modal is a web component:
nothing React can mount inside its shadow root, so the behaviour is
reimplemented rather than imported. Above 640px nothing changes — it stays a
centred dialog.

The drag grip is the handle and header only. Extending it to the body would
mean competing with the scroll container for every gesture, and a sheet that
swallows scrolls is worse than one with a smaller grip. `prefers-reduced-motion`
skips the slide entirely.

## Accessibility

`role="dialog"` with `aria-modal`, Escape to close, a focus trap that respects
the shadow boundary, focus restoration on close, and
`prefers-reduced-motion` support.

## Security

Wallet names and icons come from EIP-6963 announcements, which any script on the
page can dispatch. All interpolated text is HTML-escaped, and icon URLs are
restricted to `data:image/*` and `https:` — `javascript:` icons are dropped in
favour of the fallback glyph.

## QR encoder

`encodeQr(text, level)` implements ISO/IEC 18004 byte mode for versions 1–40 at
all four EC levels, and is exported on its own:

```ts
import { encodeQr, qrToPath } from '@web3-app-kit/ui'

const matrix = encodeQr('wc:…@2?relay-protocol=irn&symKey=…', 'M')
const d = qrToPath(matrix) // SVG path data
```

MIT
