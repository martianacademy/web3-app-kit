import { useEffect, useState, type ReactElement } from 'react'

import { DodoSwapWidget, type DodoSwapWidgetProps } from './DodoSwapWidget.js'

const DURATION = 200
/** Matches the modal's own drawer breakpoint, so both switch together. */
const NARROW = '(max-width: 639px)'

/** Motion is skipped entirely when the viewer has asked for less of it. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const headerButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: 0,
  borderRadius: 999,
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--muted-foreground, #737373)',
  font: '18px/1 system-ui, sans-serif',
  outlineColor: 'var(--ring, currentColor)',
  outlineOffset: 2,
} as const

export type DodoSwapDialogProps = DodoSwapWidgetProps & {
  open: boolean
  onClose: () => void
  /**
   * Shows a back control. The modal closes before this dialog opens — it
   * cannot host the widget — so without a way back the account view becomes a
   * dead end once someone taps Swap.
   */
  onBack?: () => void
  /** Dialog heading. */
  title?: string
  /**
   * Keep the widget mounted after the first open, hidden rather than removed.
   *
   * Reopening is then instant — the widget's first mount is a few hundred
   * milliseconds of MUI and react-query setup that would otherwise be repaid
   * every time. The cost is that a hidden widget keeps polling balances, so
   * leave it off for a page where swapping is rare.
   */
  keepMounted?: boolean
}

/**
 * DODO's swap widget in a modal dialog.
 *
 * This is deliberately plain DOM rather than part of `@web3-app-kit/ui`'s
 * modal: that modal lives in a shadow root, and the widget's styles are
 * injected into `document.head`, so inside the shadow root it renders unstyled.
 */
export function DodoSwapDialog({
  open,
  onClose,
  onBack,
  title = 'Swap',
  keepMounted = false,
  ...props
}: DodoSwapDialogProps): ReactElement | null {
  // `mounted` outlives `open` so the dialog can play its exit before it goes:
  // unmounting on the prop alone makes it vanish mid-animation.
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const [everOpened, setEverOpened] = useState(open)
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW).matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = window.matchMedia(NARROW)
    const sync = () => setNarrow(query.matches)
    sync()
    // `change` is the primary signal; `resize` is a cheap safety net for the
    // rare case of it being missed. React bails out when the value is
    // unchanged, so the extra listener costs nothing on a scroll-heavy page.
    query.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    return () => {
      query.removeEventListener('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  useEffect(() => {
    const duration = prefersReducedMotion() ? 0 : DURATION
    if (open) {
      setMounted(true)
      setEverOpened(true)
      // A task later, so the closed state is painted first and the transition
      // has something to run from. Deliberately not `requestAnimationFrame`:
      // that is paused outright in a background tab, which would leave the
      // dialog stuck at opacity 0 until the tab was looked at again.
      const frame = setTimeout(() => setShown(true), 0)
      return () => clearTimeout(frame)
    }
    setShown(false)
    const timer = setTimeout(() => setMounted(false), duration)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') (onBack ?? onClose)()
    }
    document.addEventListener('keydown', onKeyDown)
    document.documentElement.style.setProperty('overflow', 'hidden')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Cleared rather than restored to a captured value. The modal releases
      // its own scroll lock at the end of its close animation, so a value read
      // when this dialog opened is still `hidden` and restoring it would leave
      // the page unscrollable for good.
      document.documentElement.style.removeProperty('overflow')
    }
  }, [open, onClose, onBack])

  const parked = !mounted && keepMounted && everOpened
  if (!mounted && !parked) return null

  const duration = prefersReducedMotion() ? 0 : DURATION

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      aria-hidden={parked || undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        // `display: none` while parked: it drops the dialog out of the layout
        // and the accessibility tree without unmounting the widget inside it.
        display: parked ? 'none' : 'flex',
        // Docked to the bottom on a phone, like the modal's drawer.
        alignItems: narrow ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: narrow ? 0 : 16,
        // Fixed rather than token-derived: a scrim built from `--foreground`
        // turns into a white veil in dark mode. This matches the modal's own.
        background: 'rgba(0, 0, 0, 0.5)',
        opacity: shown ? 1 : 0,
        transition: `opacity ${duration}ms ease-out`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: narrow ? '100%' : 420,
          maxWidth: '100%',
          maxHeight: narrow ? '85vh' : '100%',
          // The widget has a 292px floor of its own, so the card is what has to
          // shrink; without this it stays 420 wide and the phone scrolls
          // sideways.
          overflow: 'hidden',
          paddingBottom: narrow ? 'env(safe-area-inset-bottom, 0px)' : undefined,
          // `--popover` is the token the modal's card uses; `--card` is a
          // different shade and makes the two dialogs look unrelated.
          borderRadius: narrow
            ? 'var(--radius-lg, var(--radius, 12px)) var(--radius-lg, var(--radius, 12px)) 0 0'
            : 'var(--radius-lg, var(--radius, 12px))',
          background: 'var(--popover, var(--card, #fff))',
          color: 'var(--popover-foreground, var(--foreground, inherit))',
          border: '1px solid var(--border, transparent)',
          borderBottom: narrow ? 0 : undefined,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.28)',
          opacity: shown ? 1 : 0,
          // Sideways, not up: this sheet replaces the modal's rather than
          // stacking on it, so it enters the way the modal's own views do.
          transform: shown ? 'translateX(0)' : 'translateX(14px)',
          transition: `opacity ${duration}ms ease-out, transform ${duration}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        }}
      >
        {/* Its own row rather than buttons floating over the widget: the widget
            draws a title and its own controls up there, and absolute corners
            landed on top of both. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px 0',
            flex: '0 0 auto',
          }}
        >
          {onBack ? (
            <button type="button" onClick={onBack} aria-label="Back" style={headerButton}>
              ‹
            </button>
          ) : (
            <span style={{ width: 28 }} />
          )}
          <button type="button" onClick={onClose} aria-label="Close" style={headerButton}>
            ×
          </button>
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'hidden', flex: '1 1 auto' }}>
          <DodoSwapWidget {...props} />
        </div>
      </div>
    </div>
  )
}
