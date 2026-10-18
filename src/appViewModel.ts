import type { NewsFeed, NewsItem } from './api/types'
import { rarityMultipliers, rarityStats, type RarityInfo } from './rarity'
import { filterView } from './selectors'
import type { ShowMode, SortMode, View } from './views'

interface AppViewModelInput {
  pool: NewsItem[]
  feeds: Map<number, NewsFeed>
  cursors: Map<number, number>
  view: View
  showMode: ShowMode
  sortMode: SortMode
  selectedId: number | null
  unreadDrained: Set<string>
  unreadProbing: boolean
}

export interface AppViewModel {
  feedOfFolder: Map<number, Set<number>>
  visibleItems: NewsItem[]
  selected: NewsItem | null
  recentBodies: string[]
  rarityStats: Map<number, RarityInfo>
  moreServer: boolean
  drained: boolean
  unreadProbing: boolean
  viewKey: string
}

/** Derive all data that connects the current route/preferences to the UI. */
export function buildAppViewModel({
  pool,
  feeds,
  cursors,
  view,
  showMode,
  sortMode,
  selectedId,
  unreadDrained,
  unreadProbing: probeInFlight,
}: AppViewModelInput): AppViewModel {
  const feedOfFolder = new Map<number, Set<number>>()
  for (const feed of feeds.values()) {
    if (feed.folderId === null) continue
    let members = feedOfFolder.get(feed.folderId)
    if (!members) feedOfFolder.set(feed.folderId, (members = new Set()))
    members.add(feed.id)
  }

  let scope: number[]
  if (view.kind === 'feed') scope = [view.id]
  else if (view.kind === 'folder') scope = [...(feedOfFolder.get(view.id) ?? [])]
  else scope = [...cursors.keys()]

  const liveCount = scope.filter((feedId) => (cursors.get(feedId) ?? -1) >= 0).length
  const isUnreadScope = view.kind === 'feed' || view.kind === 'folder'
  const scopeKey = isUnreadScope ? `${view.kind}:${view.id}` : ''
  const unreadScopeProbed = showMode === 'unread' && isUnreadScope && unreadDrained.has(scopeKey)
  const moreServer = unreadScopeProbed ? false : liveCount > 0
  const drained = unreadScopeProbed || scope.length === 0 || liveCount === 0
  const unreadProbing =
    showMode === 'unread' && isUnreadScope && probeInFlight && moreServer && !drained

  const rarity = sortMode === 'rarity' ? rarityMultipliers(pool) : undefined
  const stats = rarityStats(pool)
  const visibleItems = filterView(pool, view, sortMode, showMode, rarity, feedOfFolder)
  const selected =
    (selectedId !== null &&
      (visibleItems.find((item) => item.id === selectedId) ??
        pool.find((item) => item.id === selectedId))) ||
    visibleItems[0] ||
    null
  const recentBodies = selected
    ? (() => {
        const recent = pool
          .filter((item) => item.feedId === selected.feedId)
          .sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
          .slice(0, 5)
        if (!recent.some((item) => item.id === selected.id)) recent.push(selected)
        return recent.map((item) => item.body)
      })()
    : []
  const viewKey =
    `${view.kind}:${view.kind === 'feed' || view.kind === 'folder' ? view.id : ''}` +
    `:${showMode}:${sortMode}`

  return {
    feedOfFolder,
    visibleItems,
    selected,
    recentBodies,
    rarityStats: stats,
    moreServer,
    drained,
    unreadProbing,
    viewKey,
  }
}
