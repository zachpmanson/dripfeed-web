import { apiGet, apiGetWithHeaders } from './client'
import { fetchItems } from './news'
import type { FeedsResponse, FoldersResponse, ItemsResponse, NewsFeed, NewsItem } from './types'
import type { Settings } from '../settings'

export const FEED_WINDOW = 20 // server batch per feed for the initial pull

const CONCURRENCY = 6

/**
 * Direct unread-only pull for one feed (type 0) or folder (type 1).
 * getRead=false makes the server filter items.unread=1, and batchSize=-1
 * disables the server LIMIT, so a single request returns EVERY unread item
 * for the scope — no need to walk history pages looking for unread ones.
 */
export async function fetchUnreadScope(
  settings: Settings,
  type: 0 | 1,
  id: number,
): Promise<NewsItem[]> {
  const resp = await fetchItems(settings, {
    type,
    id,
    getRead: false,
    batchSize: -1,
    oldestFirst: false,
  })
  return resp.items
}

/**
 * Delta pull: every item (read or unread, any feed) whose lastModified is
 * newer than `sinceSeconds`. The News server bumps last_modified on ANY
 * field change (NewsMapperV2::update), so read/star marks made by other
 * clients — the cross-device sync gap — show up here as authoritative
 * rows. This is the reconcile primitive for the poll (see store.ts).
 */
export interface UpdatedItems {
  items: NewsItem[]
  /** The server's own wall clock (UNIX seconds) from the response `Date`
   *  header, or null when the header is missing/unparseable. Callers use it
   *  as the next marker so the cursor never rides the browser's clock. */
  serverTime: number | null
}

/**
 * The server's own wall clock from a response `Date` header, in UNIX
 * seconds, or null when the header is missing/unparseable. The reconcile
 * marker is always derived from this — never from the browser's clock, which
 * can run ahead of the server and skip changes the delta has not returned.
 */
export function serverTimeFrom(headers: Headers): number | null {
  const date = headers.get('Date')
  const seconds = date ? new Date(date).getTime() / 1000 : NaN
  return Number.isFinite(seconds) ? Math.floor(seconds) : null
}

export async function fetchUpdatedItems(
  settings: Settings,
  sinceSeconds: number,
): Promise<UpdatedItems> {
  const { data, headers } = await apiGetWithHeaders<ItemsResponse>(
    settings,
    `/items/updated?type=3&lastModified=${sinceSeconds}`,
  )
  return { items: data.items, serverTime: serverTimeFrom(headers) }
}

/**
 * Initial hydration: newest FEED_WINDOW per feed, in parallel, plus the full
 * starred set. The main page (unread/rarity) only needs the newest few per
 * feed; deeper history is fetched on demand by "load more" (see store.ts).
 *
 * Per-feed paging is newest-first: offset = lowest id already loaded for
 * that feed (the API's offset is `id < offset` when oldestFirst=false), and
 * offset 0 means "no filter" (first page).
 */
export async function fetchInitial(
  settings: Settings,
  feeds: NewsFeed[],
  onProgress?: (done: number) => void,
): Promise<{ items: NewsItem[]; feedWindows: Map<number, number> }> {
  let done = 0
  const feedWindows = new Map<number, number>()
  const map = (arr: NewsFeed[], fn: (f: NewsFeed) => Promise<NewsItem[]>) => {
    let i = 0
    const out: NewsItem[][] = Array.from({ length: Math.min(CONCURRENCY, arr.length) }, () => [])
    const workers = Array.from({ length: Math.min(CONCURRENCY, arr.length) }, async (_w, wi) => {
      while (i < arr.length) {
        const f = arr[i++]
        const items = await fn(f)
        done += items.length
        onProgress?.(done)
        out[wi].push(...items) // collect per worker, return at the END of the loop
      }
    })
    return Promise.all(workers).then(() => out.flat())
  }

  const [perFeed, starred] = await Promise.all([
    map(feeds, async (f) => {
      const items = await fetchFeedWindow(settings, f.id)
      // Window boundary = oldest id of THIS page (starred items, fetched
      // separately, may be older and must not move the cursor).
      if (items.length > 0) {
        feedWindows.set(f.id, items.reduce((m, i) => Math.min(m, i.id), items[0].id))
      }
      return items
    }),
    apiGet<ItemsResponse>(
      settings,
      `/items?type=2&getRead=true&oldestFirst=false&batchSize=-1&offset=0`,
    ).then((r) => r.items),
  ])
  onProgress?.(perFeed.length + starred.length)

  return { items: [...perFeed, ...starred], feedWindows }
}

/** Newest `limit` items of one feed, older than `beforeId` (0 = newest). */
export async function fetchFeedWindow(
  settings: Settings,
  feedId: number,
  beforeId = 0,
  limit = FEED_WINDOW,
): Promise<NewsItem[]> {
  const q = `type=0&id=${feedId}&getRead=true&oldestFirst=false&batchSize=${limit}&offset=${beforeId}`
  const r = await apiGet<ItemsResponse>(settings, `/items?${q}`)
  return r.items
}

/** Feed list + folder tree (small), plus the server clock for the marker. */
export async function fetchMeta(settings: Settings): Promise<{
  feeds: FeedsResponse['feeds']
  folders: FoldersResponse['folders']
  serverTime: number | null
}> {
  const [feeds, folders] = await Promise.all([
    apiGetWithHeaders<FeedsResponse>(settings, '/feeds'),
    apiGet<FoldersResponse>(settings, '/folders'),
  ])
  return {
    feeds: feeds.data.feeds,
    folders: folders.folders,
    serverTime: serverTimeFrom(feeds.headers),
  }
}