const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Wallet names and icons arrive from EIP-6963 announcements, which any script
 * on the page can dispatch. Everything interpolated into the modal's markup
 * goes through here first.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]!)
}

/**
 * Only `data:image/*` and `https:` icons are rendered. Anything else — most
 * importantly `javascript:` — is dropped in favour of the fallback glyph.
 */
export function safeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(trimmed)) return trimmed
  if (/^https:\/\//i.test(trimmed)) return trimmed
  return undefined
}

/** Tagged template that escapes every interpolated value. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, part, index) => {
    if (index === 0) return part
    const value = values[index - 1]
    const rendered = value instanceof Raw ? value.value : escapeHtml(value)
    return acc + rendered + part
  }, '')
}

class Raw {
  constructor(readonly value: string) {}
}

/** Marks pre-sanitised markup (icons, nested templates) as safe to inline. */
export function raw(value: string): Raw {
  return new Raw(value)
}
