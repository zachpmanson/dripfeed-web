import { apiGet } from './client'
import type { FeedsResponse, FoldersResponse, ItemsResponse, NewsItem } from './types'
import type { Settings } from '../settings'

export const PAGE_SIZE = 40
const FETCH_CONCURRENCY = 6
const MAX_ITEMS = 20000 // per-feed autoPurgeCount cap: 200 × feeds ~ 4k; headroom

/**
 * Pull the FULL item history, paged oldest-first in PARALLEL chunks.
 * Best-effort: stops early on failure (a partial mirror beats nothing);
 * the caller treats a short mirror as "backfill later".
 */
export async function fetchAllItems(
  settings: Settings,
  onProgress?: (done: number, total: number) => void,
): Promise<NewsItemBatch> {
  const first = await apiGet<ItemsResponse>(
    settings,
    `/items?type=3&getRead=true&oldestFirst=true&batchSize=${PAGE_SIZE}&offset=0`,
  )
  const all: NewsItem[] = [...first.items]
  onProgress?.(all.length, all.length)

  // Items are paged by id: batch N offset = max(id) seen so far.
  let lastId = first.items.reduce((m, i) => Math.max(m, i.id), 0)
  // Parallel fetch in waves until a short page.
  while (true) {
    if (all.length >= MAX_ITEMS) break
    const wants = Math.min(FETCH_CONCURRENCY, Math.ceil((MAX_ITEMS - all.length) / PAGE_SIZE))
    if (wants <= 0) break
    const pages = await Promise.all(
      Array.from({ length: wants }, (_, k) =>
        apiGet<ItemsResponse>(
          settings,
          `/items?type=3&getRead=true&oldestFirst=true&batchSize=${PAGE_SIZE}&offset=${lastId + k * PAGE_SIZE}`,
        ),
      ),
    )
    const merged: NewsItem[] = []
    for (const p of pages) merged.push(...p.items)
    if (merged.length === 0) break // exhausted
    all.push(...merged)
    lastId = merged.reduce((m, i) => Math.max(m, i.id), lastId)
    onProgress?.(all.length, all.length)
  }
  return { items: all }
}

export interface NewsItemBatch {
  items: NewsItem[]
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