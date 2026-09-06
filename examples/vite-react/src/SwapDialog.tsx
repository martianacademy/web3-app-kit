import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useAccount, useAppKit, useSwapRequest } from '@web3-app-kit/react'
import {
  DodoSwapDialog,
  NATIVE_TOKEN_ADDRESS,
  useShadcnWidgetTheme,
  useTokenList,
} from '@web3-app-kit/swap-widget'

import { loadChainIcons, type ChainIcons } from '@web3-app-kit/chains'

import { config } from './config.js'
import { swapTokens } from './swap.js'

const apiKey = import.meta.env.VITE_DODO_API_KEY as string | undefined
// `dodo` hands the widget no `tokenList`, so it falls back to the 66 tokens it
// bundles — no Base, Linea, Scroll, Mantle or zkSync among them. Anything else
// uses the merged lists. Here so the two are easy to compare side by side.
const useBundledList = import.meta.env.VITE_SWAP_TOKEN_LIST === 'dodo'
const feeRecipient = import.meta.env.VITE_SWAP_FEE_RECIPIENT as string | undefined
const feeRate = Number(import.meta.env.VITE_SWAP_FEE_RATE)

// Hoisted above the broad list so the widget opens on a major rather than on
// whatever ticker sorts first. Matched by address, never by symbol.
const pinned = Object.entries(swapTokens).flatMap(([chainId, tokens]) =>
  tokens
    .filter((token) => token.address.toLowerCase() !== NATIVE_TOKEN_ADDRESS.toLowerCase())
    .map((token) => ({ chainId: Number(chainId), address: token.address })),
)

// The same majors again, this time for the picker's "popular" section. Pinning
// only fixes the order; this is what gives them their own row.
const popularTokenList = Object.entries(swapTokens).flatMap(([chainId, tokens]) =>
  tokens.map((token) => ({
    chainId: Number(chainId),
    address: token.address,
    symbol: token.symbol,
    name: token.name ?? token.symbol,
    decimals: token.decimals,
  })),
)

// `Widget` is only the shell; `SwapWidget` renders the swap. Lazy because
// `@dodoex/widgets` pulls in ~1000 packages — measured at ~800ms to evaluate,
// which is exactly the pause people saw after pressing Swap.
const importWidget = () => import('@dodoex/widgets')
const SwapWidget = lazy(async () => ({ default: (await importWidget()).SwapWidget as never }))

export function SwapDialog() {
  const { chain, isConnected } = useAccount()
  const { open: openModal } = useAppKit()
  const [open, setOpen] = useState(false)
  const { tokens } = useTokenList(useBundledList ? [] : undefined, pinned)
  // Reads the same shadcn variables the modal does, so the widget follows the
  // page's light/dark toggle rather than sitting in its own palette.
  const { colorMode, theme } = useShadcnWidgetTheme()

  // Native coins carry no `logoURI` — token lists index contracts — so the
  // widget draws them as placeholders. The chain's own logo is the right mark
  // for a chain's native coin, and this package already ships them.
  const [chainIcons, setChainIcons] = useState<ChainIcons | undefined>()
  useEffect(() => {
    let cancelled = false
    void loadChainIcons()
      .then((icons) => !cancelled && setChainIcons(icons))
      .catch(() => {})
    return () => void (cancelled = true)
  }, [])

  const getTokenLogoUrl = useCallback(
    ({ address, chainId, url }: { address?: string; chainId?: number; url?: string }) => {
      const isNative = address?.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
      if (isNative && chainId !== undefined) return chainIcons?.url(chainId) ?? url
      return url
    },
    [chainIcons],
  )

  // Registers the modal's Swap entry. Without a key the entry does not appear
  // at all, which is the right behaviour rather than a dead button.
  useSwapRequest(apiKey ? () => setOpen(true) : undefined)

  // Warmed as soon as a wallet is connected — the same moment the Swap entry
  // appears — so pressing it costs nothing. The module registry caches the
  // result, so `lazy` later resolves from memory instead of fetching again.
  useEffect(() => {
    if (isConnected && apiKey) void importWidget().catch(() => {})
  }, [isConnected])

  const close = useCallback(() => setOpen(false), [])
  // Back returns to where Swap was picked, rather than dumping the user on the
  // page with the modal gone.
  const back = useCallback(() => {
    setOpen(false)
    openModal({ view: 'Account' })
  }, [openModal])
  if (!apiKey) return null

  return (
    <Suspense fallback={null}>
      <DodoSwapDialog
        open={open}
        onClose={close}
        onBack={back}
        keepMounted
        config={config}
        widget={SwapWidget as never}
        apikey={apiKey}
        crossChain
        colorMode={colorMode}
        getTokenLogoUrl={getTokenLogoUrl}
        theme={theme}
        swapSlippage={1}
        popularTokenList={popularTokenList}
        {...(!useBundledList && tokens ? { tokenList: tokens } : {})}
        defaultChainId={chain?.id ?? 1}
        width="100%"
        height={560}
        {...(feeRecipient && Number.isFinite(feeRate)
          ? { rebateTo: feeRecipient, feeRate }
          : {})}
      />
    </Suspense>
  )
}
