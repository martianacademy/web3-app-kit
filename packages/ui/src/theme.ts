export type ThemeMode = 'light' | 'dark' | 'auto'

/**
 * The modal is styled with shadcn/ui's default (neutral) theme. These are the
 * same semantic tokens shadcn uses, so overriding them here is equivalent to
 * editing `:root` in a shadcn app.
 */
export type ThemeVariables = Partial<{
  /** Dialog surface. */
  popover: string
  popoverForeground: string
  /** Solid action colour — the primary button. */
  primary: string
  primaryForeground: string
  /** Subtle surface for hovered rows and avatars. */
  accent: string
  accentForeground: string
  muted: string
  mutedForeground: string
  destructive: string
  border: string
  input: string
  /** Focus ring. */
  ring: string
  /** Base corner radius; the small/medium/large steps derive from it. */
  radius: string
  fontFamily: string
  /** Backdrop behind the dialog. */
  overlay: string
  zIndex: string
}>

const VARIABLE_NAMES: Record<keyof ThemeVariables, string> = {
  popover: '--w3ak-popover',
  popoverForeground: '--w3ak-popover-foreground',
  primary: '--w3ak-primary',
  primaryForeground: '--w3ak-primary-foreground',
  accent: '--w3ak-accent',
  accentForeground: '--w3ak-accent-foreground',
  muted: '--w3ak-muted',
  mutedForeground: '--w3ak-muted-foreground',
  destructive: '--w3ak-destructive',
  border: '--w3ak-border',
  input: '--w3ak-input',
  ring: '--w3ak-ring',
  radius: '--w3ak-radius',
  fontFamily: '--w3ak-font-family',
  overlay: '--w3ak-overlay',
  zIndex: '--w3ak-z-index',
}

export function themeVariablesToCss(variables: ThemeVariables = {}): string {
  return Object.entries(variables)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${VARIABLE_NAMES[key as keyof ThemeVariables]}: ${value};`)
    .join(' ')
}

/**
 * Maps the modal's tokens onto the host page's shadcn variables. Custom
 * properties inherit across the shadow boundary, so a shadcn app that defines
 * `--popover`, `--primary` and friends gets a modal that matches its theme —
 * including whatever `.dark` is doing — with no configuration.
 *
 * Every mapping keeps the shadcn default as its fallback, so a page that
 * defines none of them is unaffected.
 */
export function hostThemeBridgeCss(): string {
  const bridge: Array<[keyof ThemeVariables, string, string]> = [
    ['popover', '--popover', 'var(--w3ak-default-popover)'],
    ['popoverForeground', '--popover-foreground', 'var(--w3ak-default-popover-foreground)'],
    ['primary', '--primary', 'var(--w3ak-default-primary)'],
    ['primaryForeground', '--primary-foreground', 'var(--w3ak-default-primary-foreground)'],
    ['accent', '--accent', 'var(--w3ak-default-accent)'],
    ['accentForeground', '--accent-foreground', 'var(--w3ak-default-accent-foreground)'],
    ['muted', '--muted', 'var(--w3ak-default-muted)'],
    ['mutedForeground', '--muted-foreground', 'var(--w3ak-default-muted-foreground)'],
    ['destructive', '--destructive', 'var(--w3ak-default-destructive)'],
    ['border', '--border', 'var(--w3ak-default-border)'],
    ['input', '--input', 'var(--w3ak-default-input)'],
    ['ring', '--ring', 'var(--w3ak-default-ring)'],
    ['radius', '--radius', 'var(--w3ak-default-radius)'],
  ]
  return bridge
    .map(([key, hostVar, fallback]) => `${VARIABLE_NAMES[key]}: var(${hostVar}, ${fallback});`)
    .join(' ')
}

/**
 * shadcn/ui's default neutral theme, hand-translated to plain CSS.
 *
 * Each colour is declared twice: a hex fallback first, then the `oklch()`
 * value shadcn actually ships. Browsers that do not understand `oklch()` drop
 * the second declaration and keep the hex, which is the exact sRGB rendering
 * of the same colour.
 */
export const styles = /* css */ `
:host {
  /* Defaults kept under their own names so the host-theme bridge can fall
     back to them without a circular reference. */
  --w3ak-default-popover: #ffffff;
  --w3ak-default-popover: oklch(1 0 0);
  --w3ak-default-popover-foreground: #0a0a0a;
  --w3ak-default-popover-foreground: oklch(0.145 0 0);
  --w3ak-default-primary: #171717;
  --w3ak-default-primary: oklch(0.205 0 0);
  --w3ak-default-primary-foreground: #fafafa;
  --w3ak-default-primary-foreground: oklch(0.985 0 0);
  --w3ak-default-accent: #f5f5f5;
  --w3ak-default-accent: oklch(0.97 0 0);
  --w3ak-default-accent-foreground: #171717;
  --w3ak-default-accent-foreground: oklch(0.205 0 0);
  --w3ak-default-muted: #f5f5f5;
  --w3ak-default-muted: oklch(0.97 0 0);
  --w3ak-default-muted-foreground: #737373;
  --w3ak-default-muted-foreground: oklch(0.556 0 0);
  --w3ak-default-destructive: #e7000b;
  --w3ak-default-destructive: oklch(0.577 0.245 27.325);
  --w3ak-default-border: #e5e5e5;
  --w3ak-default-border: oklch(0.922 0 0);
  --w3ak-default-input: #e5e5e5;
  --w3ak-default-input: oklch(0.922 0 0);
  --w3ak-default-ring: #a1a1a1;
  --w3ak-default-ring: oklch(0.708 0 0);
  --w3ak-default-radius: 0.625rem;

  --w3ak-popover: var(--w3ak-default-popover);
  --w3ak-popover-foreground: var(--w3ak-default-popover-foreground);
  --w3ak-primary: var(--w3ak-default-primary);
  --w3ak-primary-foreground: var(--w3ak-default-primary-foreground);
  --w3ak-accent: var(--w3ak-default-accent);
  --w3ak-accent-foreground: var(--w3ak-default-accent-foreground);
  --w3ak-muted: var(--w3ak-default-muted);
  --w3ak-muted-foreground: var(--w3ak-default-muted-foreground);
  --w3ak-destructive: var(--w3ak-default-destructive);
  --w3ak-border: var(--w3ak-default-border);
  --w3ak-input: var(--w3ak-default-input);
  --w3ak-ring: var(--w3ak-default-ring);
  --w3ak-radius: var(--w3ak-default-radius);

  --w3ak-overlay: rgba(0, 0, 0, 0.5);
  --w3ak-font-family: "Geist", ui-sans-serif, system-ui, -apple-system,
    "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --w3ak-font-mono: "Geist Mono", ui-monospace, SFMono-Regular, "SF Mono",
    Menlo, Consolas, monospace;
  --w3ak-z-index: 2147483000;

  /* Rounded pointy-top hexagon, the shape web3 network badges use. */
  --w3ak-chain-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M41.056 4.472Q50 0 58.944 4.472L91.056 20.528Q100 25 100 35L100 65Q100 75 91.056 79.472L58.944 95.528Q50 100 41.056 95.528L8.944 79.472Q0 75 0 65L0 35Q0 25 8.944 20.528Z'/%3E%3C/svg%3E");
  --w3ak-chain-radius: 0;

  --w3ak-radius-sm: calc(var(--w3ak-radius) - 4px);
  --w3ak-radius-md: calc(var(--w3ak-radius) - 2px);
  --w3ak-radius-lg: var(--w3ak-radius);
  --w3ak-shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --w3ak-shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);

  position: fixed;
  inset: 0;
  z-index: var(--w3ak-z-index);
  display: none;
  font-family: var(--w3ak-font-family);
  color: var(--w3ak-popover-foreground);
  font-feature-settings: "rlig" 1, "calt" 1;
  -webkit-font-smoothing: antialiased;
}

:host([data-theme="dark"]) {
  --w3ak-default-popover: #171717;
  --w3ak-default-popover: oklch(0.205 0 0);
  --w3ak-default-popover-foreground: #fafafa;
  --w3ak-default-popover-foreground: oklch(0.985 0 0);
  --w3ak-default-primary: #e5e5e5;
  --w3ak-default-primary: oklch(0.922 0 0);
  --w3ak-default-primary-foreground: #171717;
  --w3ak-default-primary-foreground: oklch(0.205 0 0);
  --w3ak-default-accent: #262626;
  --w3ak-default-accent: oklch(0.269 0 0);
  --w3ak-default-accent-foreground: #fafafa;
  --w3ak-default-accent-foreground: oklch(0.985 0 0);
  --w3ak-default-muted: #262626;
  --w3ak-default-muted: oklch(0.269 0 0);
  --w3ak-default-muted-foreground: #a1a1a1;
  --w3ak-default-muted-foreground: oklch(0.708 0 0);
  --w3ak-default-destructive: #ff6467;
  --w3ak-default-destructive: oklch(0.704 0.191 22.216);
  --w3ak-default-border: rgba(255, 255, 255, 0.1);
  --w3ak-default-border: oklch(1 0 0 / 10%);
  --w3ak-default-input: rgba(255, 255, 255, 0.15);
  --w3ak-default-input: oklch(1 0 0 / 15%);
  --w3ak-default-ring: #737373;
  --w3ak-default-ring: oklch(0.556 0 0);
}

@media (prefers-color-scheme: dark) {
  :host([data-theme="auto"]) {
    --w3ak-default-popover: #171717;
    --w3ak-default-popover: oklch(0.205 0 0);
    --w3ak-default-popover-foreground: #fafafa;
    --w3ak-default-popover-foreground: oklch(0.985 0 0);
    --w3ak-default-primary: #e5e5e5;
    --w3ak-default-primary: oklch(0.922 0 0);
    --w3ak-default-primary-foreground: #171717;
    --w3ak-default-primary-foreground: oklch(0.205 0 0);
    --w3ak-default-accent: #262626;
    --w3ak-default-accent: oklch(0.269 0 0);
    --w3ak-default-accent-foreground: #fafafa;
    --w3ak-default-accent-foreground: oklch(0.985 0 0);
    --w3ak-default-muted: #262626;
    --w3ak-default-muted: oklch(0.269 0 0);
    --w3ak-default-muted-foreground: #a1a1a1;
    --w3ak-default-muted-foreground: oklch(0.708 0 0);
    --w3ak-default-destructive: #ff6467;
    --w3ak-default-destructive: oklch(0.704 0.191 22.216);
    --w3ak-default-border: rgba(255, 255, 255, 0.1);
    --w3ak-default-border: oklch(1 0 0 / 10%);
    --w3ak-default-input: rgba(255, 255, 255, 0.15);
    --w3ak-default-input: oklch(1 0 0 / 15%);
    --w3ak-default-ring: #737373;
    --w3ak-default-ring: oklch(0.556 0 0);
  }
}

:host([chain-shape="circle"]) {
  --w3ak-chain-mask: none;
  --w3ak-chain-radius: 999px;
}
:host([chain-shape="squircle"]) {
  --w3ak-chain-mask: none;
  --w3ak-chain-radius: 30%;
}

:host([open]) { display: block; }

* { box-sizing: border-box; }

/* ---------------------------------------------------------------- dialog */

.overlay {
  position: absolute;
  inset: 0;
  background: var(--w3ak-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.overlay[data-animate] { animation: w3ak-fade 150ms ease-out; }
.body[data-enter="forward"] { animation: w3ak-enter-right 220ms cubic-bezier(0.32, 0.72, 0, 1); }
.body[data-enter="back"] { animation: w3ak-enter-left 220ms cubic-bezier(0.32, 0.72, 0, 1); }

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 400px;
  max-height: min(640px, calc(100vh - 32px));
  background: var(--w3ak-popover);
  color: var(--w3ak-popover-foreground);
  border: 1px solid var(--w3ak-border);
  border-radius: var(--w3ak-radius-lg);
  box-shadow: var(--w3ak-shadow-lg);
  overflow: hidden;
}
.card[data-animate] { animation: w3ak-zoom 150ms ease-out; }

.drawer-grip { flex: 0 0 auto; }
.drawer-handle { display: none; }

/*
 * Below Tailwind's sm breakpoint the dialog becomes a bottom sheet: full width, flush
 * to the bottom edge, rounded on top only, and draggable by the handle. This
 * is shadcn's Drawer, rebuilt in plain CSS because the modal is a web
 * component and cannot mount a React component inside its shadow root.
 */
@media (max-width: 639px) {
  .overlay {
    align-items: flex-end;
    padding: 0;
  }

  .card {
    max-width: none;
    max-height: 85vh;
    border-bottom: 0;
    border-radius: var(--w3ak-radius-lg) var(--w3ak-radius-lg) 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .card[data-animate] { animation: w3ak-slide-up 260ms cubic-bezier(0.32, 0.72, 0, 1); }

  .drawer-grip {
    /* The browser must not claim the vertical gesture we use to dismiss. */
    touch-action: none;
    cursor: grab;
  }
  .drawer-grip:active { cursor: grabbing; }

  .drawer-handle {
    display: block;
    width: 100px;
    height: 8px;
    margin: 16px auto 0;
    border-radius: 999px;
    background: var(--w3ak-muted);
  }

  header { padding-top: 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .overlay[data-animate], .card[data-animate] { animation: none; }
  .body[data-enter] { animation: none; }
}

header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 20px 12px;
}

header h1 {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  text-align: center;
}

.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px 20px;
  scrollbar-width: thin;
}

footer {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--w3ak-border);
  font-size: 12px;
  line-height: 1.5;
  color: var(--w3ak-muted-foreground);
  text-align: center;
}
footer a {
  color: var(--w3ak-popover-foreground);
  text-decoration: underline;
  text-underline-offset: 4px;
}

/* --------------------------------------------------------------- buttons */

.icon-button {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--w3ak-radius-sm);
  background: transparent;
  color: var(--w3ak-popover-foreground);
  opacity: 0.7;
  cursor: pointer;
  transition: opacity 150ms, background-color 150ms;
}
.icon-button:hover { opacity: 1; background: var(--w3ak-accent); }
.icon-button[hidden] { visibility: hidden; }

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--w3ak-border);
  border-radius: var(--w3ak-radius-md);
  background: var(--w3ak-popover);
  color: var(--w3ak-popover-foreground);
  box-shadow: var(--w3ak-shadow-xs);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 150ms, color 150ms, border-color 150ms;
}
.button:hover { background: var(--w3ak-accent); color: var(--w3ak-accent-foreground); }
.button.primary {
  background: var(--w3ak-primary);
  border-color: transparent;
  color: var(--w3ak-primary-foreground);
}
.button.primary:hover { opacity: 0.9; }
.button.danger { color: var(--w3ak-destructive); }
.button.danger:hover {
  background: color-mix(in oklab, var(--w3ak-destructive) 10%, transparent);
  color: var(--w3ak-destructive);
}
.button.full { grid-column: 1 / -1; }

.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

:is(.button, .icon-button, .row, .net-tile):focus-visible {
  outline: none;
  border-color: var(--w3ak-ring);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--w3ak-ring) 50%, transparent);
}

/* ----------------------------------------------------------- wallet list */

.list { display: flex; flex-direction: column; gap: 2px; }

.list-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 8px 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--w3ak-muted-foreground);
}
.list-label .tag {
  font-size: 11px;
  font-weight: 500;
  color: var(--w3ak-muted-foreground);
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: var(--w3ak-radius-md);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background-color 150ms, color 150ms;
}
.row:hover { background: var(--w3ak-accent); color: var(--w3ak-accent-foreground); }
.row[aria-busy="true"] { background: var(--w3ak-accent); }

.row .avatar {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--w3ak-radius-sm);
  background: var(--w3ak-muted);
  color: var(--w3ak-muted-foreground);
}

.row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .tag { font-size: 12px; font-weight: 400; color: var(--w3ak-muted-foreground); }
.row .check { display: inline-flex; color: var(--w3ak-popover-foreground); }

.empty {
  padding: 32px 8px;
  text-align: center;
  font-size: 14px;
  line-height: 1.5;
  color: var(--w3ak-muted-foreground);
}

/* ------------------------------------------------------- network grid */

/*
 * Networks read better as a grid of marks than as a list of labels: the logo
 * is what people recognise, and three tiles per row fit the dialog width
 * without truncating names.
 */
.net-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding-top: 4px;
}

.net-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 6px 12px;
  border: 1px solid transparent;
  border-radius: var(--w3ak-radius-lg);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background-color 150ms, border-color 150ms;
}
.net-tile:hover { background: var(--w3ak-accent); color: var(--w3ak-accent-foreground); }
.net-tile[aria-current="true"] {
  background: var(--w3ak-accent);
  border-color: var(--w3ak-border);
}

.net-mark-wrap { position: relative; display: inline-flex; }

.net-mark {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--w3ak-chain-radius);
  background: var(--w3ak-muted);
  color: var(--w3ak-muted-foreground);
  -webkit-mask-image: var(--w3ak-chain-mask);
  mask-image: var(--w3ak-chain-mask);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
.net-mark img { width: 100%; height: 100%; object-fit: cover; display: block; }
.net-mark svg { width: 26px; height: 26px; }

/* The current network is marked with a badge, not colour alone. */
.net-check {
  position: absolute;
  right: -5px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  border: 2px solid var(--w3ak-popover);
  background: var(--w3ak-primary);
  color: var(--w3ak-primary-foreground);
}
.net-check svg { width: 10px; height: 10px; stroke-width: 3; }

:host(:is([chain-shape="circle"], [chain-shape="squircle"])) .net-check {
  right: -2px;
  bottom: -2px;
  top: auto;
  transform: none;
}

.net-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  text-align: center;
  overflow-wrap: anywhere;
}

/* ----------------------------------------------------- namespace tabs */

.ns-tabs {
  display: flex;
  gap: 2px;
  padding: 4px;
  margin-bottom: 4px;
  border-radius: var(--w3ak-radius-md);
  background: var(--w3ak-muted);
}

.ns-tab {
  flex: 1;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--w3ak-radius-sm);
  background: transparent;
  color: var(--w3ak-muted-foreground);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 150ms, color 150ms;
}
.ns-tab:hover { color: var(--w3ak-popover-foreground); }
.ns-tab[aria-current="true"] {
  background: var(--w3ak-popover);
  color: var(--w3ak-popover-foreground);
  box-shadow: var(--w3ak-shadow-xs);
}
.ns-tab:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--w3ak-ring) 60%, transparent);
}

/* -------------------------------------------------------------- account */

.account {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 0 20px;
}
.account .avatar-lg {
  width: 64px;
  height: 64px;
  border-radius: 999px;
  object-fit: cover;
  background: var(--w3ak-muted);
}
.account .address {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
}
.account .address .check { color: var(--w3ak-muted-foreground); }
.account .balance { font-size: 14px; color: var(--w3ak-muted-foreground); }

.account-wallet {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 4px 10px 4px 4px;
  border: 1px solid var(--w3ak-border);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: var(--w3ak-muted-foreground);
}
.account-wallet .wallet-mark {
  width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  overflow: hidden;
  border-radius: 999px;
  background: var(--w3ak-muted);
}
.account-wallet .wallet-mark img { width: 100%; height: 100%; object-fit: cover; display: block; }
.account-wallet .wallet-mark svg { width: 12px; height: 12px; }

/* ----------------------------------------------------- qr / receive */

.qr, .receive {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0 8px;
}
.qr { gap: 16px; }
.receive { gap: 12px; }

/*
 * The code surface stays light in both themes. Inverted QR codes are outside
 * what ISO/IEC 18004 assumes, and plenty of wallet scanners refuse them — a
 * receive code that does not scan is worse than one that ignores dark mode.
 */
.frame {
  width: 100%;
  max-width: 288px;
  aspect-ratio: 1;
  padding: 16px;
  display: grid;
  place-items: center;
  border: 1px solid var(--w3ak-border);
  border-radius: var(--w3ak-radius-lg);
  background: #ffffff;
}
.receive .frame { max-width: 232px; padding: 12px; }
.frame svg { width: 100%; height: 100%; display: block; }

.qr p {
  margin: 0;
  max-width: 280px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--w3ak-muted-foreground);
  text-align: center;
}

.receive-chain {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--w3ak-muted-foreground);
}
.receive-chain .chain-mark img { width: 100%; height: 100%; object-fit: cover; display: block; }
.receive-chain .chain-mark svg { width: 14px; height: 14px; }

.receive-address {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--w3ak-radius-md);
  background: var(--w3ak-muted);
  font-family: var(--w3ak-font-mono);
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
  word-break: break-all;
  user-select: all;
}

.receive .button.full { width: 100%; }
.receive .button[data-copy-state="failed"] {
  background: var(--w3ak-muted);
  color: var(--w3ak-muted-foreground);
}
.receive-address::selection { background: color-mix(in oklab, var(--w3ak-ring) 45%, transparent); }

.row[disabled] { opacity: 0.4; cursor: default; }
.row[disabled]:hover { background: transparent; }


.receive-note {
  margin: 0;
  max-width: 300px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--w3ak-muted-foreground);
  text-align: center;
  text-wrap: balance;
}

.status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 8px 12px;
  text-align: center;
}
.status .avatar-lg {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--w3ak-radius-lg);
  background: var(--w3ak-muted);
  color: var(--w3ak-muted-foreground);
}
.status .avatar-lg img { width: 100%; height: 100%; object-fit: cover; }
.status h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 1; }
.status p {
  margin: 0;
  max-width: 260px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--w3ak-muted-foreground);
}
.status p.error { color: var(--w3ak-destructive); }
.status .actions { width: 100%; padding-top: 8px; }

.spinner {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 2px solid color-mix(in oklab, var(--w3ak-muted-foreground) 30%, transparent);
  border-top-color: var(--w3ak-popover-foreground);
  animation: w3ak-spin 700ms linear infinite;
}
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2s; } }

/* --------------------------------------------------------------- icons */

.icon-button svg { width: 16px; height: 16px; display: block; }
.button svg { width: 16px; height: 16px; flex: 0 0 auto; display: block; }
.row .avatar svg { width: 20px; height: 20px; }
.row .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.row .check svg,
.account .address svg { width: 16px; height: 16px; display: block; }
.status .avatar-lg svg { width: 32px; height: 32px; }

.button .chain-mark,
.receive-chain .chain-mark {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--w3ak-chain-radius);
  -webkit-mask-image: var(--w3ak-chain-mask);
  mask-image: var(--w3ak-chain-mask);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
.button .chain-mark img { width: 100%; height: 100%; object-fit: cover; display: block; }
.button .chain-mark svg { width: 16px; height: 16px; }

.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

@keyframes w3ak-spin { to { transform: rotate(360deg); } }
@keyframes w3ak-fade { from { opacity: 0; } }
@keyframes w3ak-zoom { from { opacity: 0; transform: scale(0.95); } }
@keyframes w3ak-slide-up { from { transform: translateY(100%); } }
@keyframes w3ak-enter-right { from { opacity: 0; transform: translateX(14px); } }
@keyframes w3ak-enter-left { from { opacity: 0; transform: translateX(-14px); } }
`
