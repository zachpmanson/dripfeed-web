import { fetchFeeds, fetchFolders, fetchItems } from './api/news'
import { LIST_TYPES } from './api/types'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'
import type { Settings } from './settings'

/**
 * In-memory mirror of the Nextcloud News account. Always-online by design
 * (same host as the instance), so no persistence layer: the full history is
 * pulled once with batchSize=-1 (server applies no LIMIT below 1), then a
 * bounded recent-window poll keeps it fresh.
 *
 * Unit note: the API serializes pubDate/lastModified as UNIX SECONDS (see
 * FeedFetcher::setPubDate(getTimestamp()) and the v1-3 docs examples);
 * normalize to milliseconds at ingest so the rest of the app deals in one
 * unit. (The /items/updated endpoint is not used for incremental sync — its
 * cursor semantics never match the stored seconds; the official client
 * paginates /items instead.)
 */
export interface NewsState {
  initialized: boolean
  feeds: Map<number, NewsFeed>
  folders: NewsFolder[]
  items: Map<number, NewsItem>
}

export const news: NewsState = {
  initialized: false,
  feeds: new Map(),
  folders: [],
  items: new Map(),
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
    resp.items.forEach((i) => news.items.set(i.id, normalize(i)))
    news.initialized = true
  } else {
    // Incremental: newest window, merge by id. The server auto-purges old
    // items (autoPurgeCount=200/feed), so a stale local entry only lingers
    // until this window sweep — keep the map bounded anyway.
    const resp = await fetchItems(settings, {
      type: LIST_TYPES.ALL,
      getRead: true,
      oldestFirst: false,
      batchSize: 500,
    })
    for (const i of resp.items) news.items.set(i.id, normalize(i))
    prune(news)
  }
  return news
}

/** API seconds → ms. Dated items only; undated stay null. */
function normalize(i: NewsItem): NewsItem {
  return {
    ...i,
    pubDate: i.pubDate ? i.pubDate * 1000 : null,
    lastModified: i.lastModified ? i.lastModified * 1000 : i.lastModified,
  }
}

/** Keep the map bounded: cap at 3000 newest, always keep starred. */
function prune(state: NewsState): void {
  if (state.items.size <= 3000) return
  const drop = [...state.items.values()]
    .filter((i) => !i.starred)
    .sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
    .slice(3000)
  for (const i of drop) state.items.delete(i.id)
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