import { dbClear, dbGetAllFeeds, dbGetAllFolders, dbGetAllItems, dbGetMeta, dbPutFeeds, dbPutFolders, dbPutItems, dbSetMeta } from './db'
import { fetchAllItems, fetchMeta } from './api/sync'
import { fetchItems } from './api/news'
import { LIST_TYPES } from './api/types'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'
import type { Settings } from './settings'

/**
 * IndexedDB-backed mirror: full history fetched once, cached locally,
 * then kept fresh with a small newest-window poll. UI reads come straight
 * from the DB (instant), so "load more" is local pagination.
 */
export interface SyncStatus {
  stage: 'idle' | 'fetching' | 'done'
  done: number
}

let dbReady = false
const listeners = new Set<() => void>()
let status: SyncStatus = { stage: 'idle', done: 0 }

function emit(): void {
  for (const l of listeners) l()
}

export function onStoreChange(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function getStatus(): SyncStatus {
  return status
}

/** True when the DB has been hydrated at least once (upgrade path). */
export async function isInitialized(): Promise<boolean> {
  const v = await dbGetMeta('initialized')
  return v === '1'
}

export async function fullSync(settings: Settings): Promise<void> {
  status = { stage: 'fetching', done: 0 }
  emit()

  const { feeds, folders } = await fetchMeta(settings)
  await dbPutFeeds(feeds)
  await dbPutFolders(folders)

  const all = await fetchAllItems(settings, (done) => {
    status = { stage: 'fetching', done }
    emit()
  })
  await dbPutItems(all.items)

  await dbSetMeta('initialized', '1')
  dbReady = true
  status = { stage: 'done', done: all.items.length }
  emit()
}

/**
 * Light incremental refresh: newest window merged into the DB, plus
 * feeds/folders meta. Never wipes anything (server purge prunes old items
 * naturally over later full syncs).
 */
export async function incrementalSync(settings: Settings): Promise<void> {
  const { feeds, folders } = await fetchMeta(settings)
  await dbPutFeeds(feeds)
  await dbPutFolders(folders)

  const resp = await fetchItems(settings, {
    type: LIST_TYPES.ALL,
    getRead: true,
    oldestFirst: false,
    batchSize: 500,
  })
  await dbPutItems(resp.items)
}

export async function loadAllItems(): Promise<NewsItem[]> {
  return dbGetAllItems()
}

export async function loadFeeds(): Promise<NewsFeed[]> {
  return dbGetAllFeeds()
}

export async function loadFolders(): Promise<NewsFolder[]> {
  return dbGetAllFolders()
}

export async function resetLocal(): Promise<void> {
  await dbClear()
  dbReady = false
  status = { stage: 'idle', done: 0 }
}

export function isDbReady(): boolean {
  return dbReady
}