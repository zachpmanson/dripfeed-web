import { apiGet } from './client'
import type { FeedsResponse, FoldersResponse, ItemsResponse, NewsFeed, NewsItem } from './types'
import type { Settings } from '../settings'

export const FEED_WINDOW = 20 // server batch per feed for the initial pull

const CONCURRENCY = 6

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

/** Feed list + folder tree (small). */
export async function fetchMeta(settings: Settings): Promise<{
  feeds: FeedsResponse['feeds']
  folders: FoldersResponse['folders']
}> {
  const [feeds, folders] = await Promise.all([
    apiGet<FeedsResponse>(settings, '/feeds'),
    apiGet<FoldersResponse>(settings, '/folders'),
  ])
  return { feeds: feeds.feeds, folders: folders.folders }
}