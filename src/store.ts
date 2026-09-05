import { fetchFeeds, fetchFolders, fetchItems, fetchUpdated } from './api/news'
import { LIST_TYPES } from './api/types'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'
import type { Settings } from './settings'

/**
 * In-memory mirror of the Nextcloud News account. Always-online by design
 * (same host as the instance), so no persistence layer: the full history is
 * pulled once with batchSize=-1 (server applies no LIMIT below 1), then
 * incremental /items/updated polls keep it fresh.
 */
export interface NewsState {
  initialized: boolean
  feeds: Map<number, NewsFeed>
  folders: NewsFolder[]
  items: Map<number, NewsItem>
  lastModified: number
}

export const news: NewsState = {
  initialized: false,
  feeds: new Map(),
  folders: [],
  items: new Map(),
  lastModified: 0,
}

export async function syncNews(settings: Settings): Promise<NewsState> {
  const feedsResp = await fetchFeeds(settings)
  feedsResp.feeds.forEach((f) => news.feeds.set(f.id, f))
  const foldersResp = await fetchFolders(settings)
  news.folders = foldersResp.folders

  if (!news.initialized) {
    const resp = await fetchItems(settings, {
      type: LIST_TYPES.ALL,
      getRead: true,
      oldestFirst: true,
      batchSize: -1, // full history, one request
    })
    news.items.clear()
    resp.items.forEach((i) => news.items.set(i.id, i))
    news.lastModified = resp.items.reduce((m, i) => Math.max(m, i.lastModified ?? 0), 0)
    news.initialized = true
  } else {
    const up = await fetchUpdated(settings, news.lastModified)
    if (up.items.length > 0) {
      let max = news.lastModified
      for (const i of up.items) {
        news.items.set(i.id, i)
        if ((i.lastModified ?? 0) > max) max = i.lastModified
      }
      news.lastModified = max
    }
  }
  return news
}

/** Client-side unread count — cheap enough to scan the map on render. */
export function unreadCount(items: Map<number, NewsItem>, feedId?: number): number {
  let n = 0
  for (const it of items.values()) {
    if (it.unread && (feedId === undefined || it.feedId === feedId)) n++
  }
  return n
}

export function allItems(items: Map<number, NewsItem>): NewsItem[] {
  return [...items.values()]
}