import { dbPutItem, dbGetFeedItems } from './db'
import { markRead, markUnread, setStar as setStarApi, markFeedRead, fetchFulltext } from './api/news'
import { notifyLocalChange, normalizeItem } from './store'
import type { NewsItem } from './api/types'
import type { Settings } from './settings'

/**
 * State actions: optimistic on the local DB, confirmed on the server.
 * Each is idempotent and re-entrant. notifyLocalChange() after every write
 * (success or revert) so the UI reflects the toggle immediately.
 */
export async function setRead(settings: Settings, item: NewsItem, unread: boolean): Promise<void> {
  const next: NewsItem = { ...item, unread }
  await dbPutItem(next) // local first (instant UI)
  notifyLocalChange()
  try {
    if (unread) await markUnread(settings, item.id)
    else await markRead(settings, item.id)
  } catch (e) {
    // Server failed — revert local so we don't drift.
    await dbPutItem(item)
    notifyLocalChange()
    throw e
  }
}

export async function setStar(settings: Settings, item: NewsItem, starred: boolean): Promise<void> {
  const next: NewsItem = { ...item, starred }
  await dbPutItem(next)
  notifyLocalChange()
  try {
    await setStarApi(settings, item.id)
  } catch (e) {
    await dbPutItem(item)
    notifyLocalChange()
    throw e
  }
}

/**
 * Fetch the full extracted article for an item's URL. The News server runs
 * Readability on the link and persists the extracted body, so this both
 * swaps the local body and keeps the server copy consistent for other
 * clients. Throws a friendly error when nothing could be extracted.
 */
export async function extractFulltext(settings: Settings, item: NewsItem): Promise<void> {
  const extracted = await fetchFulltext(settings, item.id)
  if (!extracted) {
    throw new Error('Could not extract an article from this URL')
  }
  await dbPutItem(normalizeItem(extracted))
  notifyLocalChange()
}

/**
 * Mark every locally-stored item of a feed as read (optimistic), then tell
 * the server to mark the whole feed read via POST /feeds/{id}/read. Passing
 * MAX_SAFE_INTEGER as newestItemId covers items we haven't loaded locally.
 * On server failure the local read flags are reverted.
 */
export async function markFeedAllRead(settings: Settings, feedId: number): Promise<void> {
  const local = await dbGetFeedItems(feedId)
  const prev = new Map(local.map((i) => [i.id, i]))
  const next = local
    .filter((i) => i.unread)
    .map((i) => ({ ...i, unread: false }))
  if (next.length > 0) {
    for (const it of next) await dbPutItem(it)
    notifyLocalChange()
  }
  try {
    await markFeedRead(settings, feedId, Number.MAX_SAFE_INTEGER)
  } catch (e) {
    for (const orig of prev.values()) await dbPutItem(orig)
    notifyLocalChange()
    throw e
  }
}