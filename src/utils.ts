import type { NewsItem } from './api/types'

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
