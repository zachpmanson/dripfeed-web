import { dbPutItem } from './db'
import { markRead, markUnread, setStar as setStarApi } from './api/news'
import type { NewsItem } from './api/types'
import type { Settings } from './settings'

/**
 * State actions: optimistic on the local DB, confirmed on the server.
 * Each is idempotent and re-entrant.
 */
export async function setRead(settings: Settings, item: NewsItem, unread: boolean): Promise<void> {
  const next: NewsItem = { ...item, unread }
  await dbPutItem(next) // local first (instant UI)
  try {
    if (unread) await markUnread(settings, item.id)
    else await markRead(settings, item.id)
  } catch (e) {
    // Server failed — revert local so we don't drift.
    await dbPutItem(item)
    throw e
  }
}

export async function setStar(settings: Settings, item: NewsItem, starred: boolean): Promise<void> {
  const next: NewsItem = { ...item, starred }
  await dbPutItem(next)
  try {
    await setStarApi(settings, item.id)
  } catch (e) {
    await dbPutItem(item)
    throw e
  }
}