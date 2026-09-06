import { apiFetchSameOrigin, apiGet, apiPost, apiDelete } from './client'
import type { FeedsResponse, FoldersResponse, ItemsResponse, ListType, NewsItem } from './types'
import type { Settings } from '../settings'

export interface ItemsParams {
  type: ListType
  id?: number
  getRead?: boolean
  batchSize?: number
  offset?: number
  oldestFirst?: boolean
}

/** GET /items — the paged list endpoint. Pagination is offset-based. */
export function fetchItems(settings: Settings, params: ItemsParams): Promise<ItemsResponse> {
  const q = new URLSearchParams({
    type: String(params.type),
    getRead: String(params.getRead ?? true),
    batchSize: String(params.batchSize ?? 40),
    offset: String(params.offset ?? 0),
    oldestFirst: String(params.oldestFirst ?? false),
  })
  if (params.id !== undefined) q.set('id', String(params.id))
  return apiGet<ItemsResponse>(settings, `/items?${q}`)
}

export function markRead(settings: Settings, itemId: number): Promise<void> {
  return apiPost(settings, `/items/${itemId}/read`)
}

/** Mark a whole feed read server-side: POST /feeds/{feedId}/read { newestItemId }. */
export function markFeedRead(
  settings: Settings,
  feedId: number,
  newestItemId: number,
): Promise<void> {
  return apiPost(settings, `/feeds/${feedId}/read`, { newestItemId })
}

export function markUnread(settings: Settings, itemId: number): Promise<void> {
  return apiPost(settings, `/items/${itemId}/unread`)
}

export function setStar(settings: Settings, itemId: number): Promise<void> {
  return apiPost(settings, `/items/${itemId}/star`)
}

/**
 * Server-side full-article extraction: GET /items/{id}/fulltext (root
 * route, not under /api/v1-3). The News server fetches the item's URL,
 * runs Readability on it, persists the extracted body, and returns the
 * updated item.
 *
 * This route has no CORS support and no CSRF exemption, so it is fetched
 * SAME-ORIGIN (relative — both the vite dev proxy and the prod caddy
 * vhost proxy /apps/*) with the OCS-APIREQUEST header that Nextcloud's
 * CSRF check accepts. Resolves with the updated item, or null when the
 * server couldn't extract anything (204 / empty body).
 */
export async function fetchFulltext(
  settings: Settings,
  itemId: number,
): Promise<NewsItem | null> {
  const res = await apiFetchSameOrigin(settings, `/apps/news/items/${itemId}/fulltext`, {
    headers: {
      'OCS-APIREQUEST': 'true',
      Accept: 'application/json',
    },
    // Server caps scraping at ~6s; be generous but don't spin forever.
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  if (!text) return null
  const items = JSON.parse(text) as NewsItem[]
  return items[0] ?? null
}

export function fetchFeeds(settings: Settings): Promise<FeedsResponse> {
  return apiGet<FeedsResponse>(settings, '/feeds')
}

export function fetchFolders(settings: Settings): Promise<FoldersResponse> {
  return apiGet<FoldersResponse>(settings, '/folders')
}

/** Create a folder. Body: { name }. Returns the folder (or array via wrappers). */
export function createFolder(
  settings: Settings,
  name: string,
): Promise<FoldersResponse> {
  return apiPost<FoldersResponse>(settings, '/folders', { name })
}

/** Add a feed. Body: { url, folderId? } (folderId 0 = no folder). */
export function createFeed(
  settings: Settings,
  url: string,
  folderId: number | null,
): Promise<FeedsResponse> {
  return apiPost<FeedsResponse>(settings, '/feeds', {
    url,
    folderId: folderId ?? 0,
  })
}

/** Delete a feed. DELETE /feeds/{feedId} */
export function deleteFeed(settings: Settings, feedId: number): Promise<void> {
  return apiDelete(settings, `/feeds/${feedId}`)
}

/** Move a feed to another folder (folderId null = no folder). POST /feeds/{feedId}/move */
export function moveFeed(
  settings: Settings,
  feedId: number,
  folderId: number | null,
): Promise<void> {
  return apiPost(settings, `/feeds/${feedId}/move`, { folderId: folderId ?? 0 })
}

/** Rename a feed. POST /feeds/{feedId}/rename { feedTitle } */
export function renameFeed(
  settings: Settings,
  feedId: number,
  feedTitle: string,
): Promise<void> {
  return apiPost(settings, `/feeds/${feedId}/rename`, { feedTitle })
}