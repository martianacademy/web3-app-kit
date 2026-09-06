#!/usr/bin/env node
/**
 * Regenerates the chain datasets from ethereum-lists/chains.
 *
 *   node scripts/generate.mjs
 *
 * Writes two modules under src/data:
 *   registry.ts — id, name, currency, RPC endpoints, explorer, flags
 *   icons.ts    — chainId -> IPFS logo, kept separate so a UI that only needs
 *                 logos does not download the RPC lists too.
 *
 * Both hold their payload as a JSON string: it parses faster than an object
 * literal of the same size and keeps the emitted file roughly JSON-sized.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHAINS_URL = 'https://chainid.network/chains.json'
const ICON_URL = (name) => `https://chainid.network/icons/${name}.json`
// ethereum-lists has no icon for several of the largest chains (Arbitrum One,
// OP Mainnet, BNB Smart Chain, …), so DefiLlama's public icon CDN is used as a
// second source. Its slug is the chain's DefiLlama name, lowercased.
const LLAMA_CHAINS_URL = 'https://api.llama.fi/v2/chains'
const CDN_ICON_URL = (slug) => `https://icons.llamao.fi/icons/chains/rsz_${encodeURIComponent(slug)}.jpg`
const CONCURRENCY = 24
const MAX_RPCS = 4

// Bundled logos. Public sources are inconsistent — DefiLlama serves Ethereum
// as a 28x28 thumbnail, which is unusable at 52px on a retina screen — so the
// chains people actually use ship as data URIs inside the package instead.
// 128px covers a 52px slot at 3x DPI, and palette PNG beats WebP by ~2x on
// flat-colour marks.
const IPFS_GATEWAYS = ['https://ipfs.io/ipfs', 'https://dweb.link/ipfs']

/**
 * web3icons (MIT) publishes SVG marks keyed by chain id, every one of them a
 * full-bleed brand-coloured tile with the mark on top. That shape is what the
 * UI needs: the marks are masked into a hexagon, and an icon with a
 * transparent background leaves nothing to mask — Ethereum's ethereum-lists
 * PNG is a near-black diamond on transparency, which all but vanishes on a
 * dark surface. They are also simply more current: ethereum-lists still ships
 * a superseded Optimism logo.
 *
 * So vectors are the default, and the raster pipeline covers the chains they
 * do not have.
 *
 * Pinned to a commit so regenerating is reproducible. Bump deliberately.
 */
const WEB3ICONS_REF = '64e21e68cc6eaa36ff9d0a135ca2c809a759ccd6'
const WEB3ICONS_BASE = `https://cdn.jsdelivr.net/gh/0xa3k5/web3icons@${WEB3ICONS_REF}/packages/core/src`
const WEB3ICONS_NETWORKS = `${WEB3ICONS_BASE}/../../common/src/metadata/networks.json`
const WEB3ICONS_TOKENS_META = `${WEB3ICONS_BASE}/../../common/src/metadata/tokens.json`
const WEB3ICONS_WALLET_SVG = (variant, id) => `${WEB3ICONS_BASE}/svgs/wallets/${variant}/${id}.svg`

/**
 * Wallets whose logo the SDK needs but never receives.
 *
 * EIP-6963 wallets announce their own icon, so they are not here. These are
 * the gaps: the built-in connectors, and the wallets that only take over
 * `window.ethereum` and are identified by provider flags — they give us a name
 * and nothing else. Keys match the `rdns` values in `connectors/detect.ts`
 * plus the connector ids, so the runtime can look them up either way.
 */
const WALLET_ICON_KEYS = new Map([
  ['metamask', ['io.metamask']],
  ['coinbase', ['com.coinbase.wallet', 'coinbaseWallet']],
  ['wallet-connect', ['walletConnect']],
  ['rabby', ['io.rabby']],
  ['trust', ['com.trustwallet.app']],
  ['rainbow', ['me.rainbow']],
  ['zerion', ['io.zerion.wallet']],
  ['phantom', ['app.phantom']],
  ['okx', ['com.okex.wallet']],
  ['token-pocket', ['pro.tokenpocket']],
  ['exodus', ['com.exodus.web3-wallet']],
  ['xdefi', ['io.xdefi']],
  ['safe', ['global.safe', 'app.safe']],
  ['ledger', ['com.ledger']],
  ['trezor', ['com.trezor']],
  ['argent', ['xyz.argent']],
  ['ambire', ['com.ambire']],
  ['enkrypt', ['com.enkrypt']],
  ['imtoken', ['im.token']],
  ['keplr', ['app.keplr']],
  ['ronin', ['com.roninchain.wallet']],
  ['safepal', ['com.safepal']],
])
const WEB3ICONS_SVG = (variant, id) => `${WEB3ICONS_BASE}/svgs/networks/${variant}/${id}.svg`
/** Backgrounded marks match the raster set, which carries its own backdrop. */
const WEB3ICONS_VARIANTS = ['background', 'branded', 'mono']
const BUNDLED_SIZE = 128
const BUNDLED_LIMIT = 150
/**
 * Testnets whose logo upstream simply does not have, mapped to the mainnet
 * whose mark they share. Explicit rather than inferred: a name or chain-group
 * heuristic would hand every Ethereum-family testnet the Ethereum diamond,
 * including the L2 ones that have a mark of their own.
 */
const LOGO_ALIASES = new Map([
  [11155111, 1], // Ethereum Sepolia
  [17000, 1], // Holesky
  [560048, 1], // Hoodi
  [84532, 8453], // Base Sepolia
  [421614, 42161], // Arbitrum Sepolia
  [11155420, 10], // OP Sepolia
  [80002, 137], // Polygon Amoy
  [97, 56], // BNB Smart Chain Testnet
  [43113, 43114], // Avalanche Fuji
  [10200, 100], // Gnosis Chiado
  [300, 324], // zkSync Sepolia
  [59141, 59144], // Linea Sepolia
  [534351, 534352], // Scroll Sepolia
  [5003, 5000], // Mantle Sepolia
  [168587773, 81457], // Blast Sepolia
  [2442, 1101], // Polygon zkEVM Cardona
])

/**
 * Per-chain source overrides, for when the automatic pick is simply the wrong
 * artwork. There is no metric for this: a flat single-colour mark and a broken
 * tile look identical to a contrast check, so bad logos are found by eye in
 * the example app's logo audit and corrected here.
 *
 *   'vector'  force the web3icons mark
 *   'raster'  force the rendered raster, skipping the vector
 *   'https://…'  render this exact image instead
 *   { url, trim, pad }  the same, with uniform borders cropped and an
 *                       optional margin (0-0.5, a fraction of the tile) added
 *                       back so the mark's silhouette stays readable
 */
const ICON_OVERRIDES = new Map([
  // web3icons draws Base inverted — a white square on blue — when Base's mark
  // *is* the blue square. TrustWallet has it the right way round but frames it
  // in white padding, which the hexagon mask turns into a white tile with a
  // small square floating in it. Trimming the padding lets the mark fill the
  // tile, which is how Base appears everywhere else.
  // Base's mark is a plain blue rounded square — confirmed against
  // brand.base.org, docs.base.org and the `base` GitHub org, which all show
  // the same thing. (The circle-with-a-bar in ethereum-lists is the older
  // logo.) TrustWallet has it, but framed in so much white padding that the
  // hexagon mask leaves a tiny square floating in a white tile; trimmed flush
  // it fills the tile completely and reads as a blank swatch. Trimmed and then
  // re-padded a little, the rounded-square silhouette is legible again.
  [8453, {
    url: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
    trim: true,
    pad: 0.2,
  }],
  // Shape's mark is a bare black circle in every source. Rendered from the
  // transparent original it gets flattened onto white, so it stays visible on
  // a dark surface instead of vanishing into it.
  [360, 'https://shape.network/favicon.ico'],
])

/** Always bundled regardless of TVL: the chains developers test against. */
const BUNDLED_ALWAYS = [
  1, 11155111, 17000, 560048, 8453, 84532, 42161, 421614, 10, 11155420, 137,
  80002, 56, 97, 43114, 43113, 100, 10200, 324, 300, 59144, 59141, 534352,
  534351, 5000, 5003, 81457, 168587773, 34443, 7777777, 480, 1101, 2442,
]

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')

const TESTNET_PATTERN =
  /\b(testnet|test net|devnet|dev net|sepolia|holesky|hoodi|goerli|görli|ropsten|rinkeby|kovan|mumbai|amoy|fuji|chiado|chapel|alfajores|baklava|shibuya|moonbase|zhejiang|preview|staging|sandbox)\b/i

async function main() {
  console.log('fetching chains…')
  const chains = await fetchJson(CHAINS_URL)
  console.log(`  ${chains.length} chains`)

  const iconNames = [...new Set(chains.map((chain) => chain.icon).filter(Boolean))]
  console.log(`fetching ${iconNames.length} icon definitions…`)
  const iconByName = await fetchIcons(iconNames)
  console.log(`  ${iconByName.size} resolved`)

  console.log('resolving CDN icon slugs…')
  const cdnSlugByChainId = await fetchCdnSlugs()
  console.log(`  ${cdnSlugByChainId.size} verified`)

  // Icons are shared between chains (an L2 often reuses its parent's mark),
  // so they are interned and referenced by index.
  const iconList = []
  const iconIndexByKey = new Map()
  const internIcon = (icon) => {
    const key = `${icon.cid}|${icon.format}`
    let index = iconIndexByKey.get(key)
    if (index === undefined) {
      index = iconList.length
      iconList.push([icon.cid, icon.format])
      iconIndexByKey.set(key, index)
    }
    return index
  }

  const registryRows = []
  const iconRows = []

  for (const chain of chains.sort((a, b) => a.chainId - b.chainId)) {
    const icon = chain.icon ? iconByName.get(chain.icon) : undefined
    const cdnSlug = cdnSlugByChainId.get(chain.chainId) ?? ''
    if (icon || cdnSlug) iconRows.push([chain.chainId, icon ? internIcon(icon) : -1, cdnSlug])

    registryRows.push([
      chain.chainId,
      chain.name,
      chain.shortName ?? '',
      chain.chain ?? '',
      chain.nativeCurrency?.name ?? '',
      chain.nativeCurrency?.symbol ?? '',
      chain.nativeCurrency?.decimals ?? 18,
      pickRpcs(chain),
      chain.explorers?.[0]?.url ?? '',
      chain.explorers?.[0]?.name ?? '',
      flagsFor(chain),
      chain.parent?.chain ? parseEip155(chain.parent.chain) : 0,
      chain.infoURL ?? '',
    ])
  }

  console.log('building bundled logos…')
  const bundled = await buildBundledIcons(chains, iconByName, cdnSlugByChainId)
  console.log(`  ${bundled.byChain.length} chains, ${bundled.images.length} unique images`)

  console.log('fetching wallet logos…')
  const wallets = await buildWalletIcons()
  console.log(`  ${wallets.icons.length} logos, ${wallets.byKey.length} keys`)

  console.log('indexing token icons…')
  const tokens = await buildTokenIndex()
  console.log(`  ${tokens.tokens.length} tokens, ${tokens.byAddress.length} addresses`)

  await mkdir(OUT_DIR, { recursive: true })

  const generatedAt = new Date().toISOString().slice(0, 10)
  const registry = { v: 1, generatedAt, source: CHAINS_URL, chains: registryRows }
  const icons = { v: 2, generatedAt, ipfs: iconList, byChain: iconRows }

  await writeFile(
    join(OUT_DIR, 'registry.ts'),
    module_(
      'REGISTRY_JSON',
      registry,
      `Every EVM chain known to ethereum-lists/chains (${registryRows.length} entries).`,
    ),
  )
  if (bundled.byChain.length > 0) {
    const payload = { v: 1, generatedAt, size: BUNDLED_SIZE, ...bundled }
    await writeFile(
      join(OUT_DIR, 'bundled-icons.ts'),
      module_(
        'BUNDLED_ICONS_JSON',
        payload,
        `${BUNDLED_SIZE}px PNG logos for ${bundled.byChain.length} chains, inlined as data URIs.`,
      ),
    )
    console.log(`wrote bundled-icons.ts (${kb(JSON.stringify(payload))})`)
  }

  if (wallets.icons.length > 0) {
    const payload = { v: 1, generatedAt, ...wallets }
    await writeFile(
      join(OUT_DIR, 'wallet-icons.ts'),
      module_(
        'WALLET_ICONS_JSON',
        payload,
        `Logos for ${wallets.icons.length} wallets that do not announce one themselves.`,
      ),
    )
    console.log(`wrote wallet-icons.ts (${kb(JSON.stringify(payload))})`)
  }

  if (tokens.tokens.length > 0) {
    const payload = { v: 1, generatedAt, ref: WEB3ICONS_REF, ...tokens }
    await writeFile(
      join(OUT_DIR, 'token-icons.ts'),
      module_(
        'TOKEN_ICONS_JSON',
        payload,
        `Lookup from token address or symbol to a web3icons SVG, for ${tokens.tokens.length} tokens.`,
      ),
    )
    console.log(`wrote token-icons.ts (${kb(JSON.stringify(payload))})`)
  }

  await writeFile(
    join(OUT_DIR, 'icons.ts'),
    module_(
      'ICONS_JSON',
      icons,
      `Logos for ${iconRows.length} chains: ${iconList.length} unique IPFS images plus ` +
        `${[...cdnSlugByChainId.keys()].length} CDN slugs.`,
    ),
  )

  console.log(
    `wrote registry.ts (${kb(JSON.stringify(registry))}) and icons.ts (${kb(JSON.stringify(icons))})`,
  )
}

function pickRpcs(chain) {
  const seen = new Set()
  const result = []
  for (const rpc of chain.rpc ?? []) {
    if (typeof rpc !== 'string') continue
    // Templated endpoints need an API key the SDK does not have, and websocket
    // endpoints are not usable as an HTTP transport.
    if (!rpc.startsWith('https://')) continue
    if (rpc.includes('${') || rpc.includes('API_KEY')) continue
    const host = safeHost(rpc)
    if (!host || seen.has(host)) continue
    seen.add(host)
    result.push(rpc)
    if (result.length >= MAX_RPCS) break
  }
  return result
}

function safeHost(url) {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

const FLAG_TESTNET = 1
const FLAG_DEPRECATED = 2

function flagsFor(chain) {
  let flags = 0
  const haystack = `${chain.name} ${chain.title ?? ''} ${chain.shortName ?? ''}`
  if (TESTNET_PATTERN.test(haystack) || (chain.faucets?.length ?? 0) > 0) flags |= FLAG_TESTNET
  if (chain.status === 'deprecated') flags |= FLAG_DEPRECATED
  return flags
}

function parseEip155(value) {
  const match = /^eip155-(\d+)$/.exec(String(value))
  return match ? Number(match[1]) : 0
}

/**
 * DefiLlama publishes an icon per chain it tracks, keyed by its own chain name.
 * Not every entry actually has an image, so each candidate is probed once and
 * only the ones that resolve are recorded.
 */
async function fetchCdnSlugs() {
  const result = new Map()
  let entries
  try {
    entries = await fetchJson(LLAMA_CHAINS_URL)
  } catch (error) {
    console.warn(`  skipping CDN icons: ${error.message}`)
    return result
  }

  const candidates = entries.filter((entry) => entry?.chainId && entry?.name)
  let cursor = 0

  const worker = async () => {
    while (cursor < candidates.length) {
      const entry = candidates[cursor++]
      const slug = String(entry.name).toLowerCase()
      try {
        const response = await fetch(CDN_ICON_URL(slug), { method: 'GET' })
        if (!response.ok) continue
        const blob = await response.arrayBuffer()
        // A 404 page is served as a tiny body with a 200 in some cases.
        if (blob.byteLength < 200) continue
        result.set(Number(entry.chainId), slug)
      } catch {
        // Unreachable icon — the IPFS source still covers most chains.
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return result
}

async function fetchIcons(names) {
  const result = new Map()
  let cursor = 0

  const worker = async () => {
    while (cursor < names.length) {
      const name = names[cursor++]
      try {
        const definitions = await fetchJson(ICON_URL(name))
        const best = pickIcon(definitions)
        if (best) result.set(name, best)
      } catch {
        // A missing icon is not fatal; the UI falls back to a generic glyph.
      }
      if (result.size % 200 === 0 && result.size > 0) process.stdout.write('.')
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  process.stdout.write('\n')
  return result
}

function pickIcon(definitions) {
  if (!Array.isArray(definitions)) return undefined
  // Prefer vector, then the smallest raster that is still legible.
  const usable = definitions
    .filter((entry) => typeof entry?.url === 'string' && entry.url.startsWith('ipfs://'))
    .sort((a, b) => rank(a) - rank(b))
  const best = usable[0]
  if (!best) return undefined
  return { cid: best.url.slice('ipfs://'.length), format: best.format ?? 'png' }
}

function rank(entry) {
  if (entry.format === 'svg') return 0
  return 1 + Math.abs((entry.width ?? 512) - 256) / 1000
}

function module_(name, value, description) {
  const json = JSON.stringify(value)
  return `// GENERATED FILE — do not edit. Run \`pnpm --filter @web3-app-kit/chains generate\`.
// ${description}
// Source: ${CHAINS_URL} (ethereum-lists/chains, CC0)

export const ${name} = ${jsStringLiteral(json)}
`
}

/** Single-quoted literal: JSON's double quotes then need no escaping. */
function jsStringLiteral(value) {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
}

function kb(value) {
  return `${Math.round(value.length / 1024)} KB`
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return response.json()
}

await main()

// ---------------------------------------------------------------------------
// Bundled logos

/**
 * Renders the highest-resolution source available for each popular chain down
 * to a fixed-size PNG and inlines it. Sources disagree wildly on quality — the
 * same chain can be 1000px on IPFS and 28px on the CDN — so both are measured
 * and the larger one wins.
 *
 * Requires `sharp`. Without it the step is skipped and the previously
 * generated file is left untouched.
 */
async function buildBundledIcons(chains, iconByName, cdnSlugByChainId) {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    console.warn('  skipping: `sharp` is not installed (pnpm add -D sharp)')
    return { images: [], byChain: [] }
  }

  // Aliased chains are resolved from their target at the end, so they are kept
  // out of the fetch/render pass entirely — that also guarantees a testnet ends
  // up with byte-identical artwork to its mainnet rather than a second-best
  // source of its own.
  const wanted = (await selectPopularChains(chains)).filter(
    (chain) => !LOGO_ALIASES.has(chain.chainId),
  )
  const svgByChain = await fetchWeb3IconSvgs(wanted)
  console.log(`  ${svgByChain.size} vector marks from web3icons`)

  const images = []
  const indexByHash = new Map()
  const byChain = []

  const intern = (uri) => {
    let index = indexByHash.get(uri)
    if (index === undefined) {
      index = images.length
      images.push(uri)
      indexByHash.set(uri, index)
    }
    return index
  }

  const renderQueue = []
  let cursor = 0
  const worker = async () => {
    while (cursor < wanted.length) {
      const chain = wanted[cursor++]
      const override = ICON_OVERRIDES.get(chain.chainId)
      const overrideUrl = overrideUrlOf(override)

      const svg = svgByChain.get(chain.chainId)
      if (svg && override !== 'raster' && !overrideUrl) {
        byChain.push([chain.chainId, intern(svg)])
        continue
      }

      let source = overrideUrl
        ? await downloadAsSource(overrideUrl)
        : override === 'vector'
          ? undefined // asked for a vector this build does not have
          : await bestSource(sharp, chain, iconByName, cdnSlugByChainId)
      if (!source) continue

      if (source && override?.trim) {
        try {
          source = { ...source, buffer: await sharp(source.buffer).trim({ threshold: 10 }).toBuffer() }
        } catch {
          // Nothing to trim, or the image is a single flat colour.
        }
      }
      renderQueue.push([chain.chainId, source.buffer])

      try {
        // Flattened onto white rather than left transparent: these are masked
        // into a hexagon by the UI, and a bare mark on transparency has no
        // tile to cut — it just floats, and disappears entirely when it is
        // dark and the surface is dark.
        const margin = Math.round(BUNDLED_SIZE * (override?.pad ?? 0))
        const inner = BUNDLED_SIZE - margin * 2
        const resized = () => {
          const pipeline = sharp(source.buffer)
            .resize(inner, inner, {
              // A trimmed mark is meant to fill its box edge to edge.
              fit: override?.trim ? 'cover' : 'contain',
              position: 'centre',
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            })
            .flatten({ background: { r: 255, g: 255, b: 255 } })
          return margin > 0
            ? pipeline.extend({
                top: margin,
                bottom: margin,
                left: margin,
                right: margin,
                background: { r: 255, g: 255, b: 255, alpha: 1 },
              })
            : pipeline
        }

        // Neither format wins everywhere: palette PNG is far smaller for flat
        // marks, WebP for anything with gradients. Encode both, keep the
        // smaller. A browser too old for WebP simply fails the image and the
        // URL fallbacks take over.
        const [png, webp] = await Promise.all([
          resized().png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer(),
          resized().webp({ quality: 80, effort: 6 }).toBuffer(),
        ])
        const [type, data] = png.length <= webp.length ? ['png', png] : ['webp', webp]

        byChain.push([chain.chainId, intern(`data:image/${type};base64,${data.toString('base64')}`)])
      } catch {
        // Unreadable source — the URL fallbacks still cover this chain.
      }
      if (byChain.length % 25 === 0 && byChain.length > 0) process.stdout.write('.')
    }
  }

  await Promise.all(Array.from({ length: 12 }, worker))
  process.stdout.write('\n')

  // Point aliased testnets at whatever image their mainnet ended up with.
  const indexByChain = new Map(byChain)
  for (const [alias, target] of LOGO_ALIASES) {
    const index = indexByChain.get(target)
    if (index === undefined) continue
    byChain.push([alias, index])
    indexByChain.set(alias, index)
  }

  byChain.sort((a, b) => a[0] - b[0])
  return { images, byChain }
}

/** DefiLlama's TVL ranking as a stand-in for "chains people actually use". */
async function selectPopularChains(chains) {
  const byId = new Map(chains.map((chain) => [chain.chainId, chain]))
  const ids = new Set(BUNDLED_ALWAYS)

  try {
    const entries = await fetchJson(LLAMA_CHAINS_URL)
    entries
      .filter((entry) => entry?.chainId && typeof entry.tvl === 'number')
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, BUNDLED_LIMIT)
      .forEach((entry) => ids.add(Number(entry.chainId)))
  } catch {
    console.warn('  could not rank chains by TVL; bundling the fixed list only')
  }

  return [...ids].map((id) => byId.get(id)).filter(Boolean)
}

/**
 * Fetches every candidate source and returns the one with the most pixels,
 * along with that size so the caller can decide it is not good enough.
 */
async function bestSource(sharp, chain, iconByName, cdnSlugByChainId) {
  const candidates = []
  const icon = chain.icon ? iconByName.get(chain.icon) : undefined
  if (icon) candidates.push(...IPFS_GATEWAYS.map((base) => `${base}/${icon.cid}`))
  const slug = cdnSlugByChainId.get(chain.chainId)
  if (slug) candidates.push(CDN_ICON_URL(slug))

  let best
  let bestPixels = 0
  const seenIpfs = new Set()

  for (const url of candidates) {
    // The gateways serve the same CID; one success is enough.
    const cid = url.split('/ipfs/')[1]
    if (cid && seenIpfs.has(cid)) continue

    const buffer = await download(url)
    if (!buffer) continue
    if (cid) seenIpfs.add(cid)

    try {
      const { width = 0, height = 0 } = await sharp(buffer).metadata()
      const pixels = Math.max(width, height)
      if (pixels > bestPixels) {
        bestPixels = pixels
        best = buffer
      }
    } catch {
      // Not an image sharp can read (an SVG with features it rejects, say).
    }
  }

  return best ? { buffer: best, pixels: bestPixels } : undefined
}

function overrideUrlOf(override) {
  if (typeof override === 'string' && /^https?:\/\//.test(override)) return override
  if (override && typeof override === 'object' && override.url) return override.url
  return undefined
}

async function downloadAsSource(url) {
  const buffer = await download(url)
  return buffer ? { buffer, pixels: Number.POSITIVE_INFINITY } : undefined
}

async function download(url) {
  try {
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok) return undefined
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.byteLength > 200 ? buffer : undefined
  } catch {
    return undefined
  }
}

/**
 * Downloads the web3icons vector mark for every chain that has one.
 *
 * The SVGs end up as `data:` URIs consumed through `<img src>`, where scripts
 * never run — but any SVG carrying one is skipped anyway rather than shipped.
 */
async function fetchWeb3IconSvgs(chains) {
  const result = new Map()

  let metadata
  try {
    metadata = await fetchJson(WEB3ICONS_NETWORKS)
  } catch (error) {
    console.warn(`  skipping vector marks: ${error.message}`)
    return result
  }

  const byChainId = new Map(
    metadata.filter((entry) => entry?.chainId && entry?.id).map((entry) => [Number(entry.chainId), entry]),
  )

  const wanted = chains.map((chain) => byChainId.get(chain.chainId)).filter(Boolean)
  let cursor = 0

  const worker = async () => {
    while (cursor < wanted.length) {
      const entry = wanted[cursor++]
      const variant = WEB3ICONS_VARIANTS.find((name) => entry.variants?.includes(name))
      if (!variant) continue

      const buffer = await download(WEB3ICONS_SVG(variant, entry.id))
      if (!buffer) continue

      const svg = buffer.toString('utf8')
      if (!svg.trimStart().startsWith('<svg')) continue
      if (/<script|\son\w+\s*=/i.test(svg)) continue

      result.set(
        Number(entry.chainId),
        `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`,
      )
    }
  }

  await Promise.all(Array.from({ length: 12 }, worker))
  return result
}

// ---------------------------------------------------------------------------
// Token icons

/**
 * Indexes web3icons' token metadata so an app can go from a token address to
 * an SVG. The images themselves are not bundled — 1,800 of them would dwarf
 * everything else here — they are served from jsDelivr, pinned to the same
 * commit, so no hosting of our own is involved either way.
 *
 * Addresses are the primary key: a token contract's `symbol()` is attacker
 * controlled, so matching on it alone would happily show USDC's logo next to a
 * counterfeit. Symbols are kept only as a last-resort fallback.
 */
async function buildTokenIndex() {
  let metadata
  let networks
  try {
    ;[metadata, networks] = await Promise.all([
      fetchJson(WEB3ICONS_TOKENS_META),
      fetchJson(WEB3ICONS_NETWORKS),
    ])
  } catch (error) {
    console.warn(`  skipping token icons: ${error.message}`)
    return { tokens: [], byAddress: [], bySymbol: [] }
  }

  const chainIdBySlug = new Map(
    networks.filter((n) => n?.chainId && n?.id).map((n) => [n.id, Number(n.chainId)]),
  )

  const tokens = []
  const indexByKey = new Map()
  const byAddress = []
  const bySymbol = []

  for (const token of metadata) {
    const id = String(token?.filePath ?? '').split(':').pop()
    const symbol = token?.symbol
    if (!id || !symbol) continue

    const key = `${id}|${symbol}`
    let index = indexByKey.get(key)
    if (index === undefined) {
      index = tokens.length
      tokens.push([id, symbol])
      indexByKey.set(key, index)
    }

    bySymbol.push([symbol.toUpperCase(), index])

    for (const [slug, address] of Object.entries(token.addresses ?? {})) {
      const chainId = chainIdBySlug.get(slug)
      if (!chainId || typeof address !== 'string' || !address.startsWith('0x')) continue
      // The `0x` prefix is re-added at read time; dropping it saves ~4 KB.
      byAddress.push([chainId, address.toLowerCase().slice(2), index])
    }
  }

  byAddress.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1))
  return { tokens, byAddress, bySymbol }
}

// ---------------------------------------------------------------------------
// Wallet logos

/**
 * Bundles a logo for each wallet in {@link WALLET_ICON_KEYS}. Small enough to
 * inline — twenty-odd SVGs — and it removes the last case where the modal has
 * to fall back to a generic glyph for a wallet it can actually name.
 */
async function buildWalletIcons() {
  const icons = []
  const byKey = []
  const entries = [...WALLET_ICON_KEYS]
  let cursor = 0

  const worker = async () => {
    while (cursor < entries.length) {
      const [id, keys] = entries[cursor++]

      let svg
      for (const variant of WEB3ICONS_VARIANTS) {
        const buffer = await download(WEB3ICONS_WALLET_SVG(variant, id))
        if (!buffer) continue
        const text = buffer.toString('utf8')
        if (!text.trimStart().startsWith('<svg')) continue
        if (/<script|\son\w+\s*=/i.test(text)) continue
        svg = text
        break
      }
      if (!svg) continue

      const index = icons.length
      icons.push(`data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`)
      for (const key of keys) byKey.push([key.toLowerCase(), index])
    }
  }

  await Promise.all(Array.from({ length: 8 }, worker))
  byKey.sort((a, b) => (a[0] < b[0] ? -1 : 1))
  return { icons, byKey }
}
