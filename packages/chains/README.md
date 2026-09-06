# @web3-app-kit/chains

Metadata, RPC endpoints and logos for **every EVM chain** — 2,726 networks
generated from [ethereum-lists/chains](https://github.com/ethereum-lists/chains),
with logos for 1,934 of them and 128px logos bundled for the 160 that dApps
actually use.

```bash
npm install @web3-app-kit/chains viem
```

The datasets are dynamically imported, so bundlers split them into their own
chunks: the entry point is ~9 KB, the logo table ~100 KB, the bundled logos
~283 KB, the token index ~165 KB, the wallet logos ~32 KB and the full
registry ~497 KB. An app only downloads what it calls.

## Usage

```ts
import { loadChainRegistry, loadChainIcons, toViemChain } from '@web3-app-kit/chains'

const registry = await loadChainRegistry()

registry.get(8453)              // Base
registry.getByShortName('arb1') // Arbitrum One
registry.search('zksync')       // ranked matches across id, slug, name and symbol
registry.all({ requireRpc: true })

const icons = await loadChainIcons()
icons.url(8453)   // https://icons.llamao.fi/icons/chains/rsz_base.jpg
icons.urls(8453)  // every source worth trying, best first
```

Add a chain the user picked to a live config:

```ts
const entry = registry.getByShortName('zksync')!
config.addChain(toViemChain(entry))
await switchChain(config, { chainId: entry.id })
```

## Search

`search(query, options)` ranks exact chain id first, then exact slug, exact
name, prefix matches, native symbol, and finally substring matches.

```ts
registry.search('137')[0]    // Polygon Mainnet — exact id wins
registry.search('base')[0]   // Base — exact short name
registry.search('sepolia', { includeTestnets: true, limit: 10 })
```

Testnets and deprecated chains are excluded unless you ask for them.
`requireRpc: true` drops the 209 chains with no usable public endpoint.

## Logos

Public sources disagree badly on quality — DefiLlama serves Ethereum as a
**28x28** thumbnail, which is a blurry mess in a 52px slot on a retina screen —
so the chains dApps actually use ship inside the package at a known
resolution, and the URLs are there for the long tail.

| Source | Coverage | Notes |
| --- | --- | --- |
| **bundled** | 160 chains | Full-bleed vector tiles where they exist, 128px rasters elsewhere. No network, no hosting, no gateway flakiness. ~283 KB, in its own lazily-loaded chunk. |
| CDN (DefiLlama) | ~235 chains | Fast, and the only source for several large chains, but resolution is inconsistent and requests reveal the viewer's IP to a third party. |
| IPFS (ethereum-lists) | ~1,880 chains | Canonical and high-resolution, but individual CIDs are pinned unevenly — a logo that times out on `ipfs.io` often resolves instantly on `dweb.link`. |

`urls()` returns them in that order. Render the first and advance on `error`:

```tsx
function ChainLogo({ chainId }: { chainId: number }) {
  const urls = useChainIconUrls(chainId)   // from @web3-app-kit/react
  const [index, setIndex] = useState(0)
  const src = urls[index]
  if (!src) return <FallbackGlyph />
  return <img src={src} onError={() => setIndex((i) => i + 1)} alt="" />
}
```

The built-in modal in `@web3-app-kit/ui` already does this.

### Which chains are bundled

The top 150 by TVL, plus a fixed list of the networks developers test against.
Testnets whose logo upstream does not have are aliased to the mainnet whose
mark they share — Sepolia to Ethereum, Base Sepolia to Base — from an explicit
table, because inferring it from the chain family would hand every
Ethereum-family testnet the Ethereum diamond, L2 testnets included.

### How each logo is produced

The UI masks these marks into a hexagon, so the artwork has to **fill its
box**. That single requirement decides the source order.

1. **A vector tile from [web3icons](https://github.com/0xa3k5/web3icons)**
   (MIT), keyed by chain id — a full-bleed brand-coloured tile with the mark on
   top. 97 chains. Sharp at every DPI, ~1 KB each, and more current than the
   alternatives: ethereum-lists still ships a superseded Optimism logo.
2. **A rendered raster** for the rest. Every candidate source is fetched and
   *measured*, and the one with the most pixels wins — that matters, because
   the CDN serves some logos at 28x28 while their IPFS copies are 1000px+. The
   winner is flattened onto white and encoded at 128px as both palette PNG and
   WebP, keeping whichever is smaller: flat marks compress far better as PNG,
   gradients as WebP.

Flattening is deliberate. A bare mark on a transparent background has no tile
to cut, so it floats inside the hexagon — and when the mark is dark and the
surface is dark, as with Ethereum's near-black diamond, it disappears entirely.

### When a logo is simply wrong

Upstream artwork is not uniformly good, and no encoder setting fixes that:
web3icons draws Base inverted (a white square on blue, when Base's mark *is*
the blue square), and Shape's own artwork is a bare black circle that vanishes
on a dark surface. Nor can it be detected automatically — a flat single-colour
mark and a broken tile score identically on any contrast check, so Unichain,
Celo and Blast would be flagged while Base sailed through.

So bad logos are found **by eye**, using the logo audit in the example app
(`pnpm example`), and pinned in `ICON_OVERRIDES` in the generator:

```js
const ICON_OVERRIDES = new Map([
  [8453, { url: 'https://…/base/info/logo.png', trim: true, pad: 0.2 }],
  [360, 'https://shape.network/favicon.ico'],
  // 'vector' forces the web3icons mark, 'raster' forces the rendered raster
])
```

`trim` crops uniform borders, `pad` adds a fraction of the tile back as margin.
Base needs both. Its mark is a plain blue rounded square — confirmed against
brand.base.org, docs.base.org and the `base` GitHub org, which all show exactly
that; the circle-with-a-bar still in ethereum-lists is the older logo. The
asset that has it the right way round frames it in heavy white padding, so
untouched it becomes a tiny square adrift in a white tile, and trimmed flush it
fills the hexagon and reads as a blank blue swatch. Trimmed and re-padded to
20%, the rounded-square silhouette sits inside the hexagon and is legible.

Overrides flow through the testnet aliases, so pinning Base also fixes Base
Sepolia.

Drop the whole chunk if you would rather have the bytes back:

```ts
const icons = await loadChainIcons({ bundled: false })
// or, in React
const { data } = useChainIcons({ bundled: false })
```

## Wallet logos

```ts
import { loadWalletIcons } from '@web3-app-kit/chains'

const wallets = await loadWalletIcons()
wallets.get({ rdns: 'io.metamask' })            // data:image/svg+xml;base64,…
wallets.get({ connectorId: 'walletConnect' })
```

22 keys covering 20 wallets, ~32 KB, own chunk. These exist only to fill a
gap: an EIP-6963 wallet announces its own icon and never needs this, but the
built-in connectors (WalletConnect, Coinbase) and the wallets that only take
over `window.ethereum` — which `detectInjectedWallet` can *name* but which ship
no artwork — otherwise fall back to a generic glyph.

Lookup order is `rdns`, then `connectorId`, then `name`, so it slots straight
onto what `getWalletInfo()` already returns. The modal uses it automatically.

## Token icons

```ts
import { loadTokenIcons } from '@web3-app-kit/chains'

const tokens = await loadTokenIcons()
tokens.url({ chainId: 1, address: '0xA0b8...eB48' })
// https://cdn.jsdelivr.net/gh/0xa3k5/web3icons@<commit>/…/tokens/branded/USDC.svg
```

1,849 tokens, indexed by contract address across 2,206 (chain, address) pairs.
The index ships in the package (~165 KB, own chunk); the SVGs are served from
jsDelivr, pinned to a commit, so they are immutable and there is no hosting to
run. Bundling 1,800 SVGs would dwarf every other dataset here.

**The address decides.** An address the index does not know resolves to
`undefined` *even when `symbol` matches*, because a token contract's `symbol()`
is attacker-controlled — falling through would put USDC's mark on a
counterfeit. Pass `symbol` alone only for tokens you genuinely know by ticker:

```ts
tokens.get({ chainId: 1, address: someScamToken, symbol: 'USDC' })  // undefined
tokens.get({ symbol: 'USDC' })                                      // USDC
```

Variants and self-hosting:

```ts
tokens.url({ symbol: 'USDC' }, { variant: 'mono' })
tokens.url({ symbol: 'USDC' }, { baseUrl: 'https://my.cdn/tokens' })
```

### Privacy and self-hosting

```ts
import { setIpfsGateway, setIconCdn } from '@web3-app-kit/chains'

setIpfsGateway('https://my-gateway.example/ipfs')
setIconCdn('https://my-cdn.example/chains')

// Or skip the third-party CDN entirely, per call:
icons.urls(1, { sources: ['ipfs'] })
```

Skipping the CDN means the chains it uniquely covers have no logo at all.

## Data shape

```ts
type ChainEntry = {
  id: number
  name: string
  shortName: string          // Chainlist slug: 'eth', 'base', 'arb1'
  group: string              // 'ETH', 'MATIC', …
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: readonly string[] // public HTTPS only — templated and wss dropped
  blockExplorer?: { name: string; url: string }
  isTestnet: boolean
  isDeprecated: boolean
  parentChainId?: number     // set on rollups that declare a settlement layer
  infoUrl?: string
}
```

RPC filtering keeps at most four endpoints per chain, one per host, dropping
anything that is not `https://` or that contains an API-key placeholder.

## Refreshing the data

```bash
pnpm --filter @web3-app-kit/chains generate
```

Re-fetches `chains.json`, every icon definition, and the CDN slug list
(probing each one), renders the bundled logos, then rewrites `src/data/`.
Commit the result.

The logo step needs `sharp`, which is a devDependency of this package. Without
it the step is skipped with a warning and the committed logos are left alone,
so the rest of the dataset can still be refreshed anywhere.

## Attribution

Chain data from [ethereum-lists/chains](https://github.com/ethereum-lists/chains)
(CC0). Chain icons from ethereum-lists, DefiLlama's public icon CDN, and
[web3icons](https://github.com/0xa3k5/web3icons) (MIT). Token icons from
web3icons, served via jsDelivr. Wallet logos from web3icons.

MIT
