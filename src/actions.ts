import { dbPutItem, dbGetFeed, dbGetFeedItems, dbPutFeed } from './db'
import { markRead, markUnread, setStar as setStarApi, markFeedRead, fetchFulltext, setFeedFullText as setFeedFullTextApi } from './api/news'
import { notifyLocalChange, normalizeItem } from './store'
import { isAuthError } from './api/client'
import type { NewsItem } from './api/types'
import type { Settings } from './settings'

/**
 * Optimistic feed-badge adjustment. The sidebar now reads the server's
 * exact `feed.unreadCount` rather than counting the (partial) local mirror,
 * so our own toggle has to move that number too — otherwise a click would
 * leave the badge stale until the next poll.
 */
async function bumpFeedUnread(feedId: number, delta: number): Promise<void> {
  const feed = await dbGetFeed(feedId)
  if (!feed) return
  await dbPutFeed({ ...feed, unreadCount: Math.max(0, feed.unreadCount + delta) })
}

/**
 * State actions: optimistic on the local DB, confirmed on the server.
 * Each is idempotent and re-entrant. notifyLocalChange() after every write
 * (success or revert) so the UI reflects the toggle immediately.
 */
export async function setRead(settings: Settings, item: NewsItem, unread: boolean): Promise<void> {
  const next: NewsItem = { ...item, unread }
  await dbPutItem(next) // local first (instant UI)
  await bumpFeedUnread(item.feedId, unread ? 1 : -1)
  notifyLocalChange()
  try {
    if (unread) await markUnread(settings, item.id)
    else await markRead(settings, item.id)
  } catch (e) {
    // Server failed — revert local so we don't drift.
    await dbPutItem(item)
    await bumpFeedUnread(item.feedId, unread ? -1 : 1)
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
 * True when an action failure should bounce the user back to the login form:
 * either a hard 401 (credentials rejected) or a 429 (rate-limit / bruteforce
 * throttle, which Nextcloud returns for a few requests before it settles on
 * 401 when the stored app password is stale). Treating 429 as auth-related
 * here is what makes a changed password force a re-login instead of leaving
 * the user silently stuck on failing POSTs.
 */
export function isAuthFailure(e: unknown): boolean {
  return isAuthError(e) || (e instanceof Error && /\b429\b/.test(e.message))
}

/**
 * Fetch the full extracted article for an item's URL. The News server runs
 * Readability on the link and persists the extracted body, so this both
 * swaps the local body and keeps the server copy consistent for other
 * clients. Throws a friendly error when nothing could be extracted.
 */
export async function extractFulltext(settings: Settings, item: NewsItem): Promise<void> {
  let extracted: NewsItem | null
  try {
    extracted = await fetchFulltext(settings, item.id)
  } catch (e) {
    if (
      e instanceof TypeError ||
      (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError'))
    ) {
      throw new Error('network error — could not reach the server')
    }
    throw e
  }
  if (!extracted) {
    throw new Error('Could not extract an article from this URL')
  }
  await dbPutItem(normalizeItem(extracted))
  notifyLocalChange()
}

/**
 * Per-feed settings write. Optimistic on the local feed row (the sidebar
 * re-render is instant), then the News server's own feed-settings route.
 * On failure the row is restored so the toggle never lies about what the
 * server holds — the caller surfaces the error.
 *
 * Reached same-origin only, so a feed whose baseUrl points at a DIFFERENT
 * Nextcloud cannot be written (that install is not behind the /apps proxy).
 * The error is deliberately left to bubble rather than being swallowed:
 * a toggle that silently did nothing would be worse than a visible failure.
 */
export async function setFeedFullText(
  settings: Settings,
  feedId: number,
  fullTextEnabled: boolean,
): Promise<void> {
  const prev = await dbGetFeed(feedId)
  if (prev) await dbPutFeed({ ...prev, fullTextEnabled })
  notifyLocalChange()
  try {
    await setFeedFullTextApi(settings, feedId, fullTextEnabled)
  } catch (e) {
    if (prev) await dbPutFeed(prev)
    notifyLocalChange()
    throw e
  }
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
  // Optimistic badge zeroing, alongside the item flags (see bumpFeedUnread).
  // Zeroed even when no locally-stored item flips: the local window is only
  // a slice of the feed, while the badge is the server's whole count — and
  // the server-side mark-feed-read below covers the rest.
  const prevFeed = await dbGetFeed(feedId)
  if (next.length > 0) {
    for (const it of next) await dbPutItem(it)
  }
  if (prevFeed) await dbPutFeed({ ...prevFeed, unreadCount: 0 })
  notifyLocalChange()
  try {
    await markFeedRead(settings, feedId, Number.MAX_SAFE_INTEGER)
  } catch (e) {
    for (const orig of prev.values()) await dbPutItem(orig)
    if (prevFeed) await dbPutFeed(prevFeed)
    notifyLocalChange()
    throw e
  }
}