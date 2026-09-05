import { apiGet, apiPost } from './client'
import type { FeedsResponse, FoldersResponse, ItemsResponse, ListType } from './types'
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

/**
 * GET /items/updated — incremental sync. Returns items whose lastModified is
 * newer than `lastModified` for the given list, plus a `newestItemId` field
 * (in ItemsResponse) usable as the next cursor.
 */
export function fetchUpdated(
  settings: Settings,
  lastModified: number,
  type: ListType = 3,
  id = 0,
): Promise<ItemsResponse> {
  const q = new URLSearchParams({
    type: String(type),
    id: String(id),
    lastModified: String(lastModified),
  })
  return apiGet<ItemsResponse>(settings, `/items/updated?${q}`)
}

export function markRead(settings: Settings, itemId: number): Promise<void> {
  return apiPost(settings, `/items/${itemId}/read`)
}

export function markUnread(settings: Settings, itemId: number): Promise<void> {
  return apiPost(settings, `/items/${itemId}/unread`)
}

export function setStar(settings: Settings, itemId: number): Promise<void> {
  return apiPost(settings, `/items/${itemId}/star`)
}

export function fetchFeeds(settings: Settings): Promise<FeedsResponse> {
  return apiGet<FeedsResponse>(settings, '/feeds')
}

export function fetchFolders(settings: Settings): Promise<FoldersResponse> {
  return apiGet<FoldersResponse>(settings, '/folders')
}