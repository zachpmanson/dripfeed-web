import { dbClear, dbFeedStats, dbGetAllFeeds, dbGetAllFolders, dbGetAllItems, dbGetMeta, dbPutFeeds, dbPutFolders, dbPutItems, dbSetMeta } from './db'
import { fetchFeedWindow, fetchInitial, fetchMeta } from './api/sync'
import { fetchItems } from './api/news'
import { LIST_TYPES } from './api/types'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'
import type { Settings } from './settings'
import { FEED_WINDOW } from './api/sync'

/**
 * IndexedDB-backed mirror. Initial hydration is per-feed: the newest
 * FEED_WINDOW (20) of every feed + the full starred set — the main page only
 * needs the newest few per feed. Deeper history is fetched on demand by
 * loadMore. Kept fresh with a small newest-window poll.
 *
 * Unit note: the API serializes pubDate/lastModified as UNIX SECONDS;
 * normalize to ms at ingest so display, gaps and sorting agree.
 */
export interface SyncStatus {
  stage: 'idle' | 'fetching' | 'done'
  done: number
}

let dbReady = false
const listeners = new Set<() => void>()
let status: SyncStatus = { stage: 'idle', done: 0 }

function emit(): void {
  for (const l of listeners) l()
}

export function onStoreChange(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function getStatus(): SyncStatus {
  return status
}

export async function isInitialized(): Promise<boolean> {
  return (await dbGetMeta('initialized')) === '1'
}

export async function fullSync(settings: Settings): Promise<void> {
  status = { stage: 'fetching', done: 0 }
  emit()

  const { feeds, folders } = await fetchMeta(settings)
  await dbPutFeeds(feeds)
  await dbPutFolders(folders)

  const { items } = await fetchInitial(settings, feeds, (done) => {
    status = { stage: 'fetching', done }
    emit()
  })
  await dbPutItems(items.map(normalize))

  await dbSetMeta('initialized', '1')
  dbReady = true
  status = { stage: 'done', done: items.length }
  emit()
}

/** Light refresh: newest-500 window merged + feeds/folders meta. */
export async function incrementalSync(settings: Settings): Promise<void> {
  const { feeds, folders } = await fetchMeta(settings)
  await dbPutFeeds(feeds)
  await dbPutFolders(folders)

  const resp = await fetchItems(settings, {
    type: LIST_TYPES.ALL,
    getRead: true,
    oldestFirst: false,
    batchSize: 500,
  })
  await dbPutItems(resp.items.map(normalize))
}

/**
 * Fetch the next FEED_WINDOW of history per feed (or one feed if feedId is
 * given), appending into the DB. Returns how many items were added.
 */
export async function loadMoreInto(
  settings: Settings,
  feedId?: number,
  onProgress?: (done: number) => void,
): Promise<number> {
  const { min } = await dbFeedStats()
  const feeds = await dbGetAllFeeds()
  const targets = feedId !== undefined ? feeds.filter((f) => f.id === feedId) : feeds
  const todo = targets.filter((f) => min.has(f.id)) // only feeds with items
  let added = 0
  let i = 0
  const workers = Array.from({ length: Math.min(6, todo.length) }, async () => {
    while (i < todo.length) {
      const f = todo[i++]
      const items = await fetchFeedWindow(settings, f.id, min.get(f.id) ?? 0)
      if (items.length > 0) await dbPutItems(items.map(normalize))
      added += items.length
      onProgress?.(added)
    }
  })
  await Promise.all(workers)
  return added
}

export async function loadAllItems(): Promise<NewsItem[]> {
  return dbGetAllItems()
}

export async function loadFeeds(): Promise<NewsFeed[]> {
  return dbGetAllFeeds()
}

export async function loadFolders(): Promise<NewsFolder[]> {
  return dbGetAllFolders()
}

/** API seconds → ms for the two timestamp fields. */
function normalize(i: NewsItem): NewsItem {
  return {
    ...i,
    pubDate: i.pubDate ? Math.round(i.pubDate * 1000) : null,
    lastModified: i.lastModified ? Math.round(i.lastModified * 1000) : i.lastModified,
  }
}

export async function resetLocal(): Promise<void> {
  await dbClear()
  dbReady = false
  status = { stage: 'idle', done: 0 }
}

export function isDbReady(): boolean {
  return dbReady
}

export { FEED_WINDOW }