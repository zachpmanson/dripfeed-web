import { dbClear, dbGetCursor, dbGetFeedItems, dbGetAllFeeds, dbGetAllFolders, dbGetAllItems, dbGetMeta, dbPutFeeds, dbPutFolders, dbPutItems, dbSetCursor, dbSetMeta } from './db'
import { fetchFeedWindow, fetchInitial, fetchMeta } from './api/sync'
import { fetchItems } from './api/news'
import { LIST_TYPES } from './api/types'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'
import { clearSettings } from './settings'
import type { Settings } from './settings'
import { FEED_WINDOW } from './api/sync'

/** Target items to add per load-more invocation (≈ a screenful). */
export const LOAD_STEP = 60

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

/**
 * Ping React that the local DB changed WITHOUT a server round-trip.
 * Optimistic read/star toggles write the DB directly (actions.ts) — they
 * must hit the listeners too, or the UI only catches up on the next poll
 * or reload.
 */
export function notifyLocalChange(): void {
  emit()
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

  const { items, feedWindows } = await fetchInitial(settings, feeds, (done) => {
    status = { stage: 'fetching', done }
    emit()
  })
  await dbPutItems(items.map(normalize))
  // Per-feed window cursors: seeds for load-more paging. Starred items are
  // deliberately excluded from cursor positions (they're old and separate).
  for (const [feedId, minId] of feedWindows) await dbSetCursor(feedId, minId)

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
export interface LoadMoreProgress {
  added: number
  feedsPaged: number
  totalFeeds: number
}

/**
 * Pull more history into the local store for a set of feeds, list-driven.
 *
 * Instead of blasting a whole window from every feed at once (the old
 * behaviour — N requests per click, DB grew unevenly), it pages ONE feed
 * at a time, always choosing the feed whose next-older items belong
 * nearest the bottom of the currently-sorted visible list. For the newest
 * sort that's the in-scope feed with the LARGEST oldest-loaded pubDate;
 * it's a good heuristic for rarity too (rarity re-ranks the whole pool, so
 * we just need to surface older items from *some* feed).
 *
 * It stops once it has added ~step items (a screenful) or every in-scope
 * feed has drained, so the pool grows only as much as the view needs and
 * onProgress can report per-feed progress.
 *
 * Returns how many items were added.
 */
export async function loadMoreInto(
  settings: Settings,
  feedIds: number[],
  step = LOAD_STEP,
  onProgress?: (p: LoadMoreProgress) => void,
): Promise<number> {
  const allFeeds = await dbGetAllFeeds()
  const targets = feedIds
    .map((id) => allFeeds.find((f) => f.id === id))
    .filter((f): f is NewsFeed => !!f)
  let live = (
    await Promise.all(
      targets.map(async (f) => ({ f, cursor: await dbGetCursor(f.id) })),
    )
  ).filter((x) => x.cursor !== undefined && x.cursor >= 0)

  const totalFeeds = live.length
  if (totalFeeds === 0) return 0

  let added = 0
  let paged = 0
  while (live.length > 0 && added < step) {
    // Oldest-loaded (non-starred) pubDate per live feed — the candidate
    // whose next page sits nearest the bottom of the newest-sorted list.
    const dated = await Promise.all(
      live.map(async ({ f, cursor }) => {
        const items = await dbGetFeedItems(f.id)
        let min: number | null = null
        for (const it of items) {
          if (it.starred) continue
          const d = it.pubDate ?? 0
          if (min === null || d < min) min = d
        }
        return { f, cursor: cursor as number, min: min ?? 0 }
      }),
    )
    dated.sort((a, b) => b.min - a.min)
    const pick = dated[0]

    const items = await fetchFeedWindow(settings, pick.f.id, pick.cursor)
    if (items.length === 0) {
      await dbSetCursor(pick.f.id, -1) // drained
      live = live.filter((x) => x.f.id !== pick.f.id)
      continue
    }
    await dbPutItems(items.map(normalize))
    const nextMin = items.reduce((m, i) => Math.min(m, i.id), items[0].id)
    const drained = items.length < FEED_WINDOW
    await dbSetCursor(pick.f.id, drained ? -1 : nextMin)
    added += items.length
    paged += 1
    onProgress?.({ added, feedsPaged: paged, totalFeeds })
    if (drained) live = live.filter((x) => x.f.id !== pick.f.id)
  }
  return added
}

/**
 * Navigate-to-feed ensure: make the local feed window whole and determine
 * whether more history exists on the server.
 *
 * 1. Auto-load pages while the feed has FEWER than FEED_WINDOW items locally
 *    and a live cursor (recovers from a mid-sync partial window, and drains
 *    short feeds so load-more stops showing for them).
 * 2. Probe: with exactly a full window loaded and a live cursor, one
 *    batchSize=1 request at the cursor decides "more exist" — if empty the
 *    feed is fully drained (cursor → -1, no load-more button); if not, the
 *    button stays.
 *
 * Returns how many items were added.
 */
export async function ensureFeedWindow(settings: Settings, feedId: number): Promise<number> {
  const all = await dbGetAllItems()
  let local = all.reduce((n, i) => (i.feedId === feedId ? n + 1 : n), 0)
  let added = 0
  let cursor = await dbGetCursor(feedId)

  // 1. top up to a full window while the server keeps returning pages
  while (local + added < FEED_WINDOW && cursor !== undefined && cursor >= 0) {
    const items = await fetchFeedWindow(settings, feedId, cursor)
    if (items.length === 0) {
      await dbSetCursor(feedId, -1)
      cursor = -1
      break
    }
    await dbPutItems(items.map(normalize))
    added += items.length
    cursor = items.length < FEED_WINDOW ? -1 : items.reduce((m, i) => Math.min(m, i.id), items[0].id)
    await dbSetCursor(feedId, cursor)
  }

  // 2. probe: exactly a full window + live cursor → one 1-item request
  //    decides whether more history actually exists behind the cursor
  if (cursor !== undefined && cursor >= 0 && local + added >= FEED_WINDOW) {
    const probe = await fetchFeedWindow(settings, feedId, cursor, 1)
    if (probe.length === 0) {
      await dbSetCursor(feedId, -1) // truly drained — button hides
    } else {
      await dbPutItems(probe.map(normalize)) // it exists — keep it
      added += probe.length
      const probeMin = probe.reduce((m, i) => Math.min(m, i.id), probe[0].id)
      await dbSetCursor(feedId, probeMin)
    }
  }

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
  // Logout = purge EVERYTHING: the local DB and the stored credentials.
  // The old reset only cleared IDB, so a refresh re-read `dripfeed.settings`
  // from localStorage and "remembered" the account.
  clearSettings()
  localStorage.removeItem('dripfeed.sort')
  localStorage.removeItem('dripfeed.showAll')
  localStorage.removeItem('dripfeed.folders.collapsed')
}

export function isDbReady(): boolean {
  return dbReady
}

export { FEED_WINDOW }