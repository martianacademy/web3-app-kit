import { useEffect, useMemo, type ReactNode } from 'react'
import { shortenAddress } from '@web3-app-kit/core'
import type { ModalView } from '@web3-app-kit/ui'

import { useAccount } from '../hooks/useAccount.js'
import { useAppKit } from '../hooks/useAppKit.js'
import { useBalance, useEnsName } from '../hooks/useBalance.js'

export type ConnectButtonProps = {
  /** Text shown while disconnected. */
  label?: ReactNode
  /** Show the native-token balance next to the address. Defaults to `false`. */
  showBalance?: boolean
  /** Show the current network name. Defaults to `true`. */
  showNetwork?: boolean
  /** Resolve and display an ENS name instead of the address. Defaults to `true`. */
  showEnsName?: boolean
  /** Added to every button this renders, for styling with your own CSS. */
  className?: string
  /**
   * Render your own markup. Receives everything the default button uses, so
   * you keep the connection logic without inheriting the styling.
   */
  children?: (state: ConnectButtonRenderProps) => ReactNode
}

export type ConnectButtonRenderProps = {
  open: (parameters?: { view?: ModalView }) => void
  isConnected: boolean
  isConnecting: boolean
  address: string | undefined
  displayName: string | undefined
  chainName: string | undefined
  balance: string | undefined
}

const STYLE_ID = 'w3ak-connect-button'

/**
 * shadcn/ui's button, as plain CSS. Every colour reads the host page's shadcn
 * variable first, so the button matches a shadcn app's theme — including its
 * `.dark` switch — with no configuration, and falls back to shadcn's own
 * neutral defaults (light and dark) everywhere else.
 */
const BUTTON_STYLES = /* css */ `
.w3ak-cb {
  --w3ak-cb-primary: var(--primary, #171717);
  --w3ak-cb-primary-fg: var(--primary-foreground, #fafafa);
  --w3ak-cb-bg: var(--background, #ffffff);
  --w3ak-cb-fg: var(--foreground, #0a0a0a);
  --w3ak-cb-accent: var(--accent, #f5f5f5);
  --w3ak-cb-border: var(--border, #e5e5e5);
  --w3ak-cb-ring: var(--ring, #a1a1a1);
  --w3ak-cb-radius: calc(var(--radius, 0.625rem) - 2px);
}

@media (prefers-color-scheme: dark) {
  .w3ak-cb {
    --w3ak-cb-primary: var(--primary, #e5e5e5);
    --w3ak-cb-primary-fg: var(--primary-foreground, #171717);
    --w3ak-cb-bg: var(--background, #0a0a0a);
    --w3ak-cb-fg: var(--foreground, #fafafa);
    --w3ak-cb-accent: var(--accent, #262626);
    --w3ak-cb-border: var(--border, rgba(255, 255, 255, 0.1));
    --w3ak-cb-ring: var(--ring, #737373);
  }
}

.w3ak-cb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: var(--w3ak-cb-radius);
  background: var(--w3ak-cb-primary);
  color: var(--w3ak-cb-primary-fg);
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: opacity 150ms, background-color 150ms, color 150ms;
}
.w3ak-cb:hover { opacity: 0.9; }
.w3ak-cb:disabled { opacity: 0.5; cursor: not-allowed; }
.w3ak-cb:focus-visible {
  outline: none;
  border-color: var(--w3ak-cb-ring);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--w3ak-cb-ring) 50%, transparent);
}

.w3ak-cb--outline {
  background: var(--w3ak-cb-bg);
  color: var(--w3ak-cb-fg);
  border-color: var(--w3ak-cb-border);
}
.w3ak-cb--outline:hover { opacity: 1; background: var(--w3ak-cb-accent); }

.w3ak-cb-group { display: inline-flex; align-items: center; gap: 8px; }
`

function useButtonStyles() {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
    const element = document.createElement('style')
    element.id = STYLE_ID
    element.textContent = BUTTON_STYLES
    document.head.append(element)
  }, [])
}

/**
 * Drop-in connect button, styled to match shadcn/ui. Renders "Connect Wallet"
 * when disconnected and the account summary when connected; clicking opens the
 * modal on the right view.
 */
export function ConnectButton({
  label = 'Connect Wallet',
  showBalance = false,
  showNetwork = true,
  showEnsName = true,
  className,
  children,
}: ConnectButtonProps) {
  useButtonStyles()

  const { open } = useAppKit()
  const { address, chain, isConnected, isConnecting, isReconnecting } = useAccount()
  const { data: ensName } = useEnsName({ enabled: showEnsName && isConnected })
  const { data: balanceData } = useBalance({ enabled: showBalance && isConnected })

  const displayName = useMemo(() => {
    if (!address) return undefined
    return (showEnsName && ensName) || shortenAddress(address)
  }, [address, ensName, showEnsName])

  const balance = balanceData ? `${balanceData.formatted} ${balanceData.symbol}` : undefined
  const pending = isConnecting || isReconnecting
  const classes = (variant?: string) =>
    ['w3ak-cb', variant, className].filter(Boolean).join(' ')

  if (children)
    return (
      <>
        {children({
          open,
          isConnected,
          isConnecting: pending,
          address,
          displayName,
          chainName: chain?.name,
          balance,
        })}
      </>
    )

  if (!isConnected)
    return (
      <button
        type="button"
        className={classes()}
        onClick={() => open({ view: 'Connect' })}
        disabled={pending}
      >
        {pending ? 'Connecting…' : label}
      </button>
    )

  return (
    <span className="w3ak-cb-group">
      {showNetwork && chain && (
        <button
          type="button"
          className={classes('w3ak-cb--outline')}
          onClick={() => open({ view: 'Networks' })}
        >
          {chain.name}
        </button>
      )}
      <button type="button" className={classes()} onClick={() => open({ view: 'Account' })}>
        {showBalance && balance ? `${balance} · ${displayName}` : displayName}
      </button>
    </span>
  )
}
