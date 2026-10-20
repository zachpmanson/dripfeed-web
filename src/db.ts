import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'
import { ItemMutationVersion, mergeServerItem } from './itemMutationVersion'

const DB_NAME = 'dripfeed'
// v2: per-feed initial sync now covers EVERY feed (the old worker returned
// after one feed, syncing only CONCURRENCY=6 feeds and leaving the rest
// without cursors — feeds never populated). Bump forces existing stores to
// wipe and re-sync so the missing feeds get their windows + cursors.
const DB_VERSION = 2

interface DripfeedDB extends DBSchema {
  items: {
    key: number
    value: NewsItem
    indexes: {
      'by-feed': number
      'by-pubDate': number
    }
  }
  feeds: {
    key: number
    value: NewsFeed
  }
  folders: {
    key: number
    value: NewsFolder
  }
  meta: {
    key: string
    value: { key: string; value: string }
  }
}

let dbPromise: Promise<IDBPDatabase<DripfeedDB>> | null = null

function getDB(): Promise<IDBPDatabase<DripfeedDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DripfeedDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          // v1 -> v2: drop everything; fullSync reruns for all feeds.
          for (const name of ['items', 'feeds', 'folders', 'meta'] as const) {
            try {
              db.deleteObjectStore(name)
            } catch {
              /* store may not exist yet */
            }
          }
        }
        const items = db.createObjectStore('items', { keyPath: 'id' })
        items.createIndex('by-feed', 'feedId')
        items.createIndex('by-pubDate', 'pubDate')
        db.createObjectStore('feeds', { keyPath: 'id' })
        db.createObjectStore('folders', { keyPath: 'id' })
        db.createObjectStore('meta', { keyPath: 'key' })
      },
    })
  }
  return dbPromise
}

let generation = 0
// Overlapping IndexedDB writers commit in order. Publish bookkeeping only after
// tx.done, and never republish state invalidated by a reset during that transaction.
const bulkReadOwners = new Map<number, symbol>()
const bulkBadgeOwners = new Map<number, symbol>()

export function dbGetGeneration(): number {
  return generation
}

export async function dbClear(): Promise<void> {
  generation += 1
  bulkReadOwners.clear()
  bulkBadgeOwners.clear()
  itemMutationVersion.clear()
  const db = await getDB()
  await Promise.all([db.clear('items'), db.clear('feeds'), db.clear('folders'), db.clear('meta')])
}

/**
 * Persist the canonical server feed set, reconciling the local store:
 * feeds that no longer exist on the server are removed locally too, along
 * with all of their locally-stored items. Without this, deleting a feed
 * (server-side DELETE) left a stale copy in IndexedDB that resurfaced on
 * the next refresh — the bug where "the old copy persists after it's been
 * removed from the server".
 */
export async function dbPutFeeds(feeds: NewsFeed[]): Promise<void> {
  const db = await getDB()
  const writeGeneration = generation
  const tx = db.transaction(['feeds', 'items'], 'readwrite')
  const ids = new Set(feeds.map((f) => f.id))
  const existing = await tx.objectStore('feeds').getAll()
  const existingById = new Map(existing.map((f) => [f.id, f]))
  for (const f of existing) {
    if (ids.has(f.id)) continue
    await tx.objectStore('feeds').delete(f.id)
    const itemKeys = await tx.objectStore('items').index('by-feed').getAllKeys(f.id)
    for (const k of itemKeys) await tx.objectStore('items').delete(k)
  }
  for (const f of feeds) {
    // The v1-3 feed response omits fullTextEnabled. Preserve the value we
    // already have instead of letting a metadata refresh clear the setting;
    // hydrateFeedFullText will replace it when the authoritative route is
    // reachable. This matters especially immediately after an optimistic
    // settings write, before the next full-text hydration completes.
    const previous = existingById.get(f.id)
    const hasFullTextFlag = typeof (f as Partial<NewsFeed>).fullTextEnabled === 'boolean'
    await tx
      .objectStore('feeds')
      .put(!hasFullTextFlag && previous ? { ...f, fullTextEnabled: previous.fullTextEnabled } : f)
  }
  await tx.done
  if (generation === writeGeneration) {
    for (const f of existing) bulkBadgeOwners.delete(f.id)
  }
}

/**
 * Merge server-authoritative per-feed `fullTextEnabled` flags into the
 * stored rows, touching no other field and creating no row.
 *
 * Needed because `dbPutFeeds` replaces whole rows from the v1-3 `/feeds`
 * list, which does not carry `fullTextEnabled` (see api/news.ts), so it
 * wipes the flag on every reconcile. This re-applies it from the route that
 * does state it. An empty map is a no-op on purpose: a failed or empty read
 * must leave the stored flags alone rather than clearing them.
 */
export async function dbMergeFeedFullText(flags: Map<number, boolean>): Promise<void> {
  if (flags.size === 0) return
  const db = await getDB()
  const tx = db.transaction('feeds', 'readwrite')
  const existing = await tx.store.getAll()
  for (const f of existing) {
    const next = flags.get(f.id)
    if (next === undefined || next === f.fullTextEnabled) continue
    await tx.store.put({ ...f, fullTextEnabled: next })
  }
  await tx.done
}

export async function dbPutFolders(folders: NewsFolder[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('folders', 'readwrite')
  const ids = new Set(folders.map((f) => f.id))
  const existing = await tx.store.getAll()
  for (const f of existing) {
    if (!ids.has(f.id)) await tx.store.delete(f.id)
  }
  for (const f of folders) await tx.store.put(f)
  await tx.done
}

const itemMutationVersion = new ItemMutationVersion()

/** Version to capture before fetching server rows for stale-response protection. */
export function dbGetItemMutationVersion(): number {
  return itemMutationVersion.snapshot()
}

export async function dbPutItems(
  items: NewsItem[],
  preserveLocalMutationsSince?: number,
): Promise<void> {
  const db = await getDB()
  const writeGeneration = generation
  const revoked: number[] = []
  const tx = db.transaction('items', 'readwrite')
  for (const item of items) {
    // Wait for earlier writers to commit before inspecting their mutation versions.
    const local =
      preserveLocalMutationsSince !== undefined ? await tx.store.get(item.id) : undefined
    const preserveLocalState =
      preserveLocalMutationsSince !== undefined &&
      itemMutationVersion.changedSince(item.id, preserveLocalMutationsSince)
    await tx.store.put(mergeServerItem(item, local, preserveLocalState))
    if (!preserveLocalState) revoked.push(item.id)
  }
  await tx.done
  if (generation === writeGeneration) {
    for (const id of revoked) bulkReadOwners.delete(id)
  }
}

export async function dbGetAllFeeds(): Promise<NewsFeed[]> {
  const db = await getDB()
  return db.getAll('feeds')
}

export async function dbGetFeed(id: number): Promise<NewsFeed | undefined> {
  const db = await getDB()
  return db.get('feeds', id)
}

/** Update one feed row (used for the optimistic unread-badge adjustment). */
export async function dbPutFeed(feed: NewsFeed): Promise<void> {
  const db = await getDB()
  const writeGeneration = generation
  await db.put('feeds', feed)
  if (generation === writeGeneration) bulkBadgeOwners.delete(feed.id)
}

export async function dbGetAllFolders(): Promise<NewsFolder[]> {
  const db = await getDB()
  return db.getAll('folders')
}

export async function dbPutItem(item: NewsItem): Promise<void> {
  await dbPutItems([item])
}

/** Apply extraction only in its original session and while its feed still exists. */
export async function dbApplyFulltext(
  item: NewsItem,
  expectedGeneration: number,
): Promise<boolean> {
  const db = await getDB()
  if (generation !== expectedGeneration) return false
  // Serialize feed deletion and the missing-item fallback in the same transaction.
  const tx = db.transaction(['items', 'feeds'], 'readwrite')
  const feed = await tx.objectStore('feeds').get(item.feedId)
  const current = await tx.objectStore('items').get(item.id)
  const accepted = !!feed && generation === expectedGeneration
  if (accepted) {
    await tx
      .objectStore('items')
      .put(current ? { ...item, unread: current.unread, starred: current.starred } : item)
  }
  // A reset during the reads is rejected above. A reset after put() is queued
  // clears this transaction's write before any replacement-session rows can land.
  await tx.done
  if (!accepted || generation !== expectedGeneration) return false
  if (current) itemMutationVersion.mark(item.id)
  else bulkReadOwners.delete(item.id)
  return true
}

/** Atomically update one stored item and return its previous and next values. */
export async function dbUpdateItem(
  id: number,
  update: (item: NewsItem) => NewsItem,
): Promise<{ previous: NewsItem | undefined; next: NewsItem | undefined }> {
  const db = await getDB()
  const writeGeneration = generation
  const tx = db.transaction('items', 'readwrite')
  const previous = await tx.store.get(id)
  const next = previous ? update(previous) : undefined
  if (next) {
    await tx.store.put(next)
  }
  await tx.done
  if (next && generation === writeGeneration) {
    if (previous?.unread !== next.unread) bulkReadOwners.delete(id)
    itemMutationVersion.mark(id)
  }
  return { previous, next }
}

/** Atomically update one stored feed row. */
export async function dbUpdateFeed(
  id: number,
  update: (feed: NewsFeed) => NewsFeed,
): Promise<{ previous: NewsFeed | undefined; next: NewsFeed | undefined }> {
  const db = await getDB()
  const writeGeneration = generation
  const tx = db.transaction('feeds', 'readwrite')
  const previous = await tx.store.get(id)
  const next = previous ? update(previous) : undefined
  if (next) {
    await tx.store.put(next)
  }
  await tx.done
  if (next && generation === writeGeneration && previous?.unreadCount !== next.unreadCount) {
    bulkBadgeOwners.delete(id)
  }
  return { previous, next }
}

/** Read intent and its badge delta must commit together, even for no-op intent. */
export async function dbSetItemUnread(id: number, unread: boolean): Promise<void> {
  const db = await getDB()
  const writeGeneration = generation
  const tx = db.transaction(['items', 'feeds'], 'readwrite')
  const item = await tx.objectStore('items').get(id)
  if (item) {
    await tx.objectStore('items').put({ ...item, unread })
    if (item.unread !== unread) {
      const feed = await tx.objectStore('feeds').get(item.feedId)
      if (feed) {
        await tx.objectStore('feeds').put({
          ...feed,
          unreadCount: Math.max(0, feed.unreadCount + (unread ? 1 : -1)),
        })
      }
    }
  }
  await tx.done
  if (item && generation === writeGeneration) {
    bulkReadOwners.delete(id)
    itemMutationVersion.mark(id)
  }
}

/**
 * Own only the read flags we flip and the badge contribution we remove.
 * Explicit read intent (even a no-op) or accepted server state revokes that
 * ownership; unrelated star/body/settings writes do not. Bulk calls for the
 * same feed must be serialized by the caller.
 */
export async function dbBeginFeedRead(feedId: number, expectedGeneration: number) {
  const db = await getDB()
  if (generation !== expectedGeneration) return
  const owner = Symbol()
  const tx = db.transaction(['items', 'feeds'], 'readwrite')
  const items = (await tx.objectStore('items').index('by-feed').getAll(feedId)).filter(
    (item) => item.unread,
  )
  const feed = await tx.objectStore('feeds').get(feedId)
  for (const item of items) {
    await tx.objectStore('items').put({ ...item, unread: false })
  }
  if (feed) {
    await tx.objectStore('feeds').put({ ...feed, unreadCount: 0 })
  }
  await tx.done
  if (generation !== expectedGeneration) return
  for (const item of items) {
    bulkReadOwners.set(item.id, owner)
    itemMutationVersion.mark(item.id)
  }
  if (feed) bulkBadgeOwners.set(feedId, owner)

  return {
    finish() {
      for (const item of items) {
        if (bulkReadOwners.get(item.id) === owner) bulkReadOwners.delete(item.id)
      }
      if (bulkBadgeOwners.get(feedId) === owner) bulkBadgeOwners.delete(feedId)
    },
    async rollback() {
      if (generation !== expectedGeneration) return
      const rollback = db.transaction(['items', 'feeds'], 'readwrite')
      const restored: number[] = []
      for (const item of items) {
        const current = await rollback.objectStore('items').get(item.id)
        if (!current || bulkReadOwners.get(item.id) !== owner) continue
        await rollback.objectStore('items').put({ ...current, unread: true })
        restored.push(item.id)
      }
      const currentFeed = await rollback.objectStore('feeds').get(feedId)
      if (feed && currentFeed && bulkBadgeOwners.get(feedId) === owner) {
        // Include unread items outside the mirror, but not superseded local flags.
        await rollback.objectStore('feeds').put({
          ...currentFeed,
          unreadCount: Math.max(
            0,
            currentFeed.unreadCount + feed.unreadCount - items.length + restored.length,
          ),
        })
      }
      await rollback.done
      if (generation === expectedGeneration) {
        for (const id of restored) itemMutationVersion.mark(id)
      }
    },
  }
}

export interface ReaderSnapshot {
  items: NewsItem[]
  feeds: NewsFeed[]
  folders: NewsFolder[]
  cursors: Map<number, number>
}

/** One committed local view, including only cursors for feeds in that view. */
export async function dbGetReaderSnapshot(): Promise<ReaderSnapshot> {
  const db = await getDB()
  const tx = db.transaction(['items', 'feeds', 'folders', 'meta'], 'readonly')
  const [items, feeds, folders] = await Promise.all([
    tx.objectStore('items').getAll(),
    tx.objectStore('feeds').getAll(),
    tx.objectStore('folders').getAll(),
  ])
  // Queue these reads together while the same transaction is still active.
  // Missing cursors stay absent; -1 remains the explicit drained sentinel.
  const rows = await Promise.all(
    feeds.map((feed) => tx.objectStore('meta').get(`cursor:${feed.id}`)),
  )
  const cursors = new Map<number, number>()
  rows.forEach((row, index) => {
    if (row !== undefined) cursors.set(feeds[index].id, Number(row.value))
  })
  await tx.done
  return { items, feeds, folders, cursors }
}

export async function dbGetAllItems(): Promise<NewsItem[]> {
  const db = await getDB()
  return db.getAll('items')
}

/** All locally stored items for a single feed (via the by-feed index). */
export async function dbGetFeedItems(feedId: number): Promise<NewsItem[]> {
  const db = await getDB()
  return db.getAllFromIndex('items', 'by-feed', feedId)
}

export async function dbGetMeta(key: string): Promise<string | undefined> {
  const db = await getDB()
  const row = await db.get('meta', key)
  return row?.value
}

export async function dbSetMeta(key: string, value: string): Promise<void> {
  const db = await getDB()
  await db.put('meta', { key, value })
}

export async function dbGetCursor(feedId: number): Promise<number | undefined> {
  const v = await dbGetMeta(`cursor:${feedId}`)
  return v === undefined ? undefined : Number(v)
}

/** Initialize atomically so overlapping hydration cannot rewind pagination. */
export async function dbInitCursor(feedId: number, id: number): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('meta', 'readwrite')
  const key = `cursor:${feedId}`
  if ((await tx.store.get(key)) === undefined) {
    await tx.store.put({ key, value: String(id) })
  }
  await tx.done
}

export async function dbSetCursor(feedId: number, id: number): Promise<void> {
  await dbSetMeta(`cursor:${feedId}`, String(id))
}
