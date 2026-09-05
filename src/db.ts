import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'

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

export async function dbClear(): Promise<void> {
  const db = await getDB()
  await Promise.all([
    db.clear('items'),
    db.clear('feeds'),
    db.clear('folders'),
    db.clear('meta'),
  ])
}

export async function dbPutFeeds(feeds: NewsFeed[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('feeds', 'readwrite')
  await Promise.all(feeds.map((f) => tx.store.put(f)))
  await tx.done
}

export async function dbPutFolders(folders: NewsFolder[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('folders', 'readwrite')
  await Promise.all(folders.map((f) => tx.store.put(f)))
  await tx.done
}

export async function dbPutItems(items: NewsItem[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('items', 'readwrite')
  await Promise.all(items.map((i) => tx.store.put(i)))
  await tx.done
}

export async function dbGetAllFeeds(): Promise<NewsFeed[]> {
  const db = await getDB()
  return db.getAll('feeds')
}

export async function dbGetAllFolders(): Promise<NewsFolder[]> {
  const db = await getDB()
  return db.getAll('folders')
}

export async function dbPutItem(item: NewsItem): Promise<void> {
  await dbPutItems([item])
}

export async function dbGetAllItems(): Promise<NewsItem[]> {
  const db = await getDB()
  return db.getAll('items')
}

/** Local pagination: items sorted by pubDate DESC, newest-first window. */
export async function dbQueryItems(batch: number, offset: number): Promise<NewsItem[]> {
  const db = await getDB()
  // index by-pubDate asc; we want descending. Walk the index backwards —
  // idb's getAllFromIndex is asc-only, so fetch a window backwards via
  // openCursor.
  const results: NewsItem[] = []
  let skipped = 0
  const total = await db.count('items')
  // items with null pubDate sort last in the asc index; we ignore them for
  // cursor positioning and append them at the end.
  let cursor = await db.transaction('items').store.index('by-pubDate').openCursor(null, 'prev')
  while (cursor && results.length < batch) {
    if (cursor.value.pubDate === null) {
      cursor = await cursor.continue()
      continue
    }
    if (skipped < offset) {
      skipped++
    } else {
      results.push(cursor.value)
    }
    cursor = await cursor.continue()
  }
  void total
  return results
}

export async function dbCount(): Promise<number> {
  const db = await getDB()
  return db.count('items')
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

export async function dbSetCursor(feedId: number, id: number): Promise<void> {
  await dbSetMeta(`cursor:${feedId}`, String(id))
}