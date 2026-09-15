import type { NewsItem } from './api/types'

/**
 * Copy text to the clipboard. Prefers the async Clipboard API and falls
 * back to a hidden textarea + execCommand, because the app is self-hostable:
 * navigator.clipboard is undefined outside a secure context (plain-HTTP
 * self-hosting), where the fallback is the only thing that works.
 *
 * Resolves once the text is on the clipboard; rejects when both paths fail
 * (so callers can show a real error instead of pretending it copied).
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  // Off-screen but still focusable/selectable (display:none breaks select()).
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-1000px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  try {
    ta.select()
    if (!document.execCommand('copy')) throw new Error('copy failed')
  } finally {
    ta.remove()
  }
}

/**
 * Fallback title for untitled items: strip HTML from the body and take the
 * first sentence (or first ~80 chars). Shared by the list and the reader.
 */
export function titleFor(item: NewsItem): string {
  if (item.title && item.title.trim()) return item.title
  const doc = new DOMParser().parseFromString(item.body || '', 'text/html')
  const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
  if (!text) return '(untitled)'
  const m = text.match(/^[^.?!]*[.?!]/)
  const first = (m ? m[0] : text).trim()
  return first.length > 0 ? first : text.slice(0, 80)
}
