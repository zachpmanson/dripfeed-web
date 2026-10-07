import type { NewsItem } from './api/types'
import { sortByRarity } from './rarity'
import type { ShowMode, SortMode, View } from './views'

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

/** Filter and order items for the current view without mutating the source pool. */
export function filterView(
  items: NewsItem[],
  view: View,
  sortMode: SortMode,
  showMode: ShowMode,
  rarityMultipliers?: Map<number, number>,
  feedOfFolder?: Map<number, Set<number>>,
): NewsItem[] {
  let list: NewsItem[]
  switch (view.kind) {
    case 'all':
      // Dedicated view: ALL items, independent of the global toggle.
      list = items
      break
    case 'allUnread':
      // Dedicated view: unread only, independent of the global toggle.
      list = items.filter((item) => item.unread)
      break
    case 'starred':
      // Independent of the global toggle: always show all starred.
      list = items.filter((item) => item.starred)
      break
    case 'feed':
    case 'folder':
      // Feeds/folders respect the global only-unread/all toggle.
      list = items.filter((item) => {
        if (view.kind === 'feed') return item.feedId === view.id
        const memberFeeds = feedOfFolder?.get(view.id)
        return !!memberFeeds && memberFeeds.has(item.feedId)
      })
      if (showMode === 'unread') list = list.filter((item) => item.unread)
      break
  }

  // Rarity applies to feed/folder views too; its multipliers cover the full pool.
  let ranked =
    sortMode === 'rarity'
      ? sortByRarity(list, rarityMultipliers)
      : [...list].sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))

  // Unread priority is a view option, not a sort: preserve each group's order.
  if (showMode === 'priority') {
    const unread: NewsItem[] = []
    const read: NewsItem[] = []
    for (const item of ranked) (item.unread ? unread : read).push(item)
    ranked = unread.concat(read)
  }
  return ranked
}