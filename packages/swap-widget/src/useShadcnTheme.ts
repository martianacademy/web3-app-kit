import { useCallback, useEffect, useState } from 'react'

/** shadcn tokens this bridge reads. */
const TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--border',
  '--primary',
  '--primary-foreground',
  '--destructive',
] as const

type Token = (typeof TOKENS)[number]
type Resolved = Partial<Record<Token, string>>

/** An unlikely colour, used to tell "token unset" from "token is this colour". */
const SENTINEL = 'rgb(1, 2, 3)'
const SENTINEL_RGB = 'rgb(1,2,3)'

const normalise = (value: string) => value.replace(/\s+/g, '')

export type ShadcnWidgetTheme = {
  colorMode: 'light' | 'dark'
  theme: Record<string, unknown>
}

/**
 * Reads shadcn's CSS variables and turns them into a `@dodoex/widgets` theme,
 * so the widget matches the rest of the product instead of shipping its own
 * palette.
 *
 * Values are resolved through a probe element rather than read as text: a
 * shadcn token is usually `oklch(...)`, which MUI's colour maths cannot parse,
 * and painting it lets the browser hand back a plain `rgb()` string.
 */
export function useShadcnWidgetTheme(host?: HTMLElement | null): ShadcnWidgetTheme {
  const read = useCallback((): ShadcnWidgetTheme => {
    if (typeof document === 'undefined') return { colorMode: 'light', theme: {} }
    const element = host ?? document.documentElement
    return build(resolveTokens(element), isDark(element))
  }, [host])

  const [value, setValue] = useState<ShadcnWidgetTheme>(read)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const element = host ?? document.documentElement
    const update = () => setValue(read())
    update()

    // The theme changes by class, attribute or an inline variable override, and
    // by the OS setting when the page has expressed no preference of its own.
    const observer = new MutationObserver(update)
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', update)

    return () => {
      observer.disconnect()
      media.removeEventListener('change', update)
    }
  }, [host, read])

  return value
}

function isDark(element: HTMLElement): boolean {
  if (element.classList.contains('dark')) return true
  const attribute = element.getAttribute('data-theme')
  if (attribute === 'dark') return true
  if (attribute === 'light') return false
  if (element.classList.contains('light')) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveTokens(element: HTMLElement): Resolved {
  const parent = element === document.documentElement ? document.body : element
  if (!parent) return {}

  const probe = document.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none'
  parent.appendChild(probe)

  const resolved: Resolved = {}
  try {
    for (const token of TOKENS) {
      probe.style.color = ''
      // The fallback is what makes an unset token detectable: without it the
      // declaration is invalid at computed-value time and `color` quietly
      // inherits, which reads exactly like a real value.
      probe.style.color = `var(${token}, ${SENTINEL})`
      const painted = getComputedStyle(probe).color
      if (painted && normalise(painted) !== SENTINEL_RGB) resolved[token] = painted
    }
  } finally {
    probe.remove()
  }
  return resolved
}

function build(t: Resolved, dark: boolean): ShadcnWidgetTheme {
  const palette: Record<string, unknown> = { mode: dark ? 'dark' : 'light' }

  // DODO's `primary` is ink, `secondary` is the call-to-action — the reverse of
  // shadcn's naming, so these are deliberately crossed over.
  const surface = t['--popover'] ?? t['--card']
  const onSurface = t['--popover-foreground'] ?? t['--card-foreground'] ?? t['--foreground']

  if (onSurface) palette.primary = { main: onSurface }
  if (t['--primary'])
    palette.secondary = { main: t['--primary'], contrastText: t['--primary-foreground'] }
  if (t['--primary'])
    palette.tabActive = { main: t['--primary'], contrastText: t['--primary-foreground'] }
  if (t['--destructive']) palette.error = { main: t['--destructive'] }
  if (t['--border'])
    palette.border = { main: t['--border'], light: t['--border'], disabled: t['--border'] }
  // `paper` is the widget's own surface, so it must be the token the modal
  // uses for its card — `--popover` — or the dialog and the widget inside it
  // end up two different shades of the same colour.
  if (surface ?? t['--muted'] ?? t['--accent'])
    palette.background = {
      paper: surface,
      paperContrast: t['--muted'],
      input: t['--muted'],
      tag: t['--accent'],
    }
  if (onSurface ?? t['--muted-foreground'])
    palette.text = {
      primary: onSurface,
      secondary: t['--muted-foreground'],
      disabled: t['--muted-foreground'],
      placeholder: t['--muted-foreground'],
    }

  return { colorMode: dark ? 'dark' : 'light', theme: { palette } }
}
