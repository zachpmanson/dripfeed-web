import type { NewsItem } from '../../api/types'

/** Template contents are inert: preview parsing must never activate feed resources. */
export function plainExcerpt(html: string, limit = 320): string {
  const template = document.createElement('template')
  // Previews must not parse megabyte feed bodies, even within a bounded chunk.
  // Truncated markup remains inert and is repaired by the template parser.
  template.innerHTML = html.slice(0, 32_768)
  template.content
    .querySelectorAll(
      'script, style, template, noscript, iframe, object, embed, svg, math, nav, footer, aside, form, [hidden], [aria-hidden="true"]',
    )
    .forEach((node) => node.remove())
  template.content
    .querySelectorAll('p, div, br, li, h1, h2, h3, h4, blockquote, tr')
    .forEach((node) => {
      node.before(document.createTextNode(' '))
      node.after(document.createTextNode(' '))
    })
  const text = (template.content.textContent ?? '').replace(/\s+/g, ' ').trim()
  const characters = Array.from(text)
  if (characters.length <= limit) return text
  return characters.slice(0, limit).join('').trimEnd() + '…'
}

export function safeImageUrl(value: string | null, base: string): string | null {
  if (!value?.trim()) return null
  try {
    // An unsafe article URL must not become a base for a relative resource.
    const baseUrl = new URL(base)
    const safeBase = ['http:', 'https:'].includes(baseUrl.protocol) ? baseUrl.href : undefined
    const url = new URL(value, safeBase)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    // Absolute metadata is still useful when the article has no valid URL.
    try {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : null
    } catch {
      return null
    }
  }
}

export function previewImage(item: NewsItem): string | null {
  return (
    safeImageUrl(item.mediaThumbnail, item.url) ??
    (item.enclosureMime?.toLowerCase().startsWith('image/')
      ? safeImageUrl(item.enclosureLink, item.url)
      : null)
  )
}

export function previewTitle(item: NewsItem): string {
  if (item.title?.trim()) return item.title
  const text = plainExcerpt(item.body, 120)
  return text.match(/^[^.?!]*[.?!]/)?.[0] ?? (text || '(untitled)')
}

export function previewExcerpt(item: NewsItem, limit = 320): string {
  return plainExcerpt(item.intro ?? '', limit) || plainExcerpt(item.body, limit)
}
