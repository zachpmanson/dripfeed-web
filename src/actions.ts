import {
  dbUpdateItem,
  dbUpdateFeed,
  dbGetFeed,
  dbPutItem,
  dbSetItemUnread,
  dbBeginFeedRead,
  dbGetGeneration,
} from './db'
import {
  markRead,
  markUnread,
  setStar as setStarApi,
  markFeedRead,
  fetchFulltext,
  setFeedFullText as setFeedFullTextApi,
} from './api/news'
import { notifyLocalChange, normalizeItem } from './store'
import { isAuthError } from './api/client'
import type { NewsItem } from './api/types'
import type { Settings } from './settings'
import { SerialOptimisticMutation } from './optimisticMutation'

const readMutations = new Map<number, SerialOptimisticMutation<boolean>>()
const starMutations = new Map<number, SerialOptimisticMutation<boolean>>()
const fullTextMutations = new Map<number, SerialOptimisticMutation<boolean>>()
const bulkReadTails = new Map<number, Promise<void>>()

function getMutation(
  mutations: Map<number, SerialOptimisticMutation<boolean>>,
  itemId: number,
  initialValue: boolean,
): SerialOptimisticMutation<boolean> {
  let mutation = mutations.get(itemId)
  // A settled queue's confirmed value may predate an authoritative refresh.
  // Keep active queues intact: their initialValue may already be optimistic.
  if (!mutation || mutation.isIdle) {
    mutation = new SerialOptimisticMutation(initialValue)
    mutations.set(itemId, mutation)
  }
  return mutation
}

async function setItemReadState(item: NewsItem, unread: boolean): Promise<void> {
  await dbSetItemUnread(item.id, unread)
  notifyLocalChange()
}

async function setItemStarState(item: NewsItem, starred: boolean): Promise<void> {
  await dbUpdateItem(item.id, (current) => ({ ...current, starred }))
  notifyLocalChange()
}

/**
 * State actions: optimistic on the local DB, confirmed on the server.
 * Each is idempotent and re-entrant. notifyLocalChange() after every write
 * (success or revert) so the UI reflects the toggle immediately.
 */
export async function setRead(settings: Settings, item: NewsItem, unread: boolean): Promise<void> {
  const optimistic = setItemReadState(item, unread)
  return getMutation(readMutations, item.id, item.unread).enqueue(
    unread,
    async () => {
      await optimistic
      if (unread) await markUnread(settings, item.id)
      else await markRead(settings, item.id)
    },
    async (confirmed) => setItemReadState(item, confirmed),
  )
}

export async function setStar(settings: Settings, item: NewsItem, starred: boolean): Promise<void> {
  const optimistic = setItemStarState(item, starred)
  return getMutation(starMutations, item.id, item.starred).enqueue(
    starred,
    async () => {
      await optimistic
      await setStarApi(settings, item.id, starred)
    },
    async (confirmed) => setItemStarState(item, confirmed),
  )
}

/** Only a 401 confirms that the server rejected the stored credentials.
 * Rate limits (429) and other server errors should be surfaced without
 * destroying the local session or sending the user back to Settings.
 */
export function isAuthFailure(e: unknown): boolean {
  return isAuthError(e)
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
      throw new Error('network error — could not reach the server', { cause: e })
    }
    throw e
  }
  if (!extracted) {
    throw new Error('Could not extract an article from this URL')
  }
  const normalized = normalizeItem(extracted)
  const { next } = await dbUpdateItem(normalized.id, (current) => ({
    ...normalized,
    unread: current.unread,
    starred: current.starred,
  }))
  // The item may have been evicted since the reader was opened.
  if (!next) await dbPutItem(normalized)
  notifyLocalChange()
}

/**
 * Per-feed settings write. Optimistic on the local feed row (the sidebar
 * re-render is instant), then the News server's own feed-settings route.
 * Writes are serialized per feed, and rollback touches only this setting so
 * an older failed toggle cannot undo a newer choice or another feed field.
 * The caller surfaces failures.
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
  const current = await dbGetFeed(feedId)
  const mutation = getMutation(fullTextMutations, feedId, current?.fullTextEnabled ?? false)
  const optimistic = dbUpdateFeed(feedId, (feed) => ({ ...feed, fullTextEnabled }))
  notifyLocalChange()
  return mutation.enqueue(
    fullTextEnabled,
    async () => {
      await optimistic
      await setFeedFullTextApi(settings, feedId, fullTextEnabled)
    },
    async (confirmed) => {
      await dbUpdateFeed(feedId, (feed) => ({ ...feed, fullTextEnabled: confirmed }))
      notifyLocalChange()
    },
  )
}

/**
 * Mark every locally-stored item of a feed as read (optimistic), then tell
 * the server to mark the whole feed read via POST /feeds/{id}/read. Passing
 * MAX_SAFE_INTEGER as newestItemId covers items we haven't loaded locally.
 * Failed writes restore only read state still owned by that operation.
 * Queue bulk calls per feed so a second snapshot cannot inherit a failed
 * first operation's optimistic state. Individual toggles and sync stay live.
 */
export async function markFeedAllRead(settings: Settings, feedId: number): Promise<void> {
  const generation = dbGetGeneration()
  const operation = (bulkReadTails.get(feedId) ?? Promise.resolve()).then(async () => {
    const optimistic = await dbBeginFeedRead(feedId, generation)
    if (!optimistic) return
    notifyLocalChange()
    try {
      await markFeedRead(settings, feedId, Number.MAX_SAFE_INTEGER)
    } catch (error) {
      await optimistic.rollback()
      notifyLocalChange()
      throw error
    } finally {
      optimistic.finish()
    }
  })
  const tail = operation.catch(() => {})
  bulkReadTails.set(feedId, tail)
  try {
    await operation
  } finally {
    if (bulkReadTails.get(feedId) === tail) bulkReadTails.delete(feedId)
  }
}
