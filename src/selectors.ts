import type { NewsItem } from './api/types'

/** Count unread items (optionally filtered to one feed) in a loaded list. */
export function unreadCount(items: NewsItem[], feedId?: number): number {
  let n = 0
  for (const it of items) {
    if (it.unread && (feedId === undefined || it.feedId === feedId)) n++
  }
  return n
}

export function starredCount(items: NewsItem[]): number {
  let n = 0
  for (const it of items) {
    if (it.starred) n++
  }
  return n
}