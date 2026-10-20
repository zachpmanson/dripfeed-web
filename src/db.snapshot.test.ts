import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'
import { dbClear, dbGetReaderSnapshot } from './db'

function feed(id: number, generation = 1): NewsFeed {
  return {
    id,
    url: '',
    title: `generation ${generation}`,
    faviconLink: null,
    added: 0,
    folderId: 1,
    unreadCount: generation,
    ordering: 0,
    link: null,
    pinned: false,
    fullTextEnabled: false,
    updateErrorCount: 0,
    lastUpdateError: null,
  }
}

function item(generation: number): NewsItem {
  return {
    id: 1,
    guid: '1',
    guidHash: '1',
    url: '',
    title: `generation ${generation}`,
    author: null,
    pubDate: generation,
    updatedDate: null,
    body: '',
    enclosureMime: null,
    enclosureLink: null,
    mediaThumbnail: null,
    mediaDescription: null,
    feedId: 1,
    unread: true,
    starred: false,
    filtered: false,
    lastModified: generation,
    rtl: false,
    intro: null,
    fingerprint: null,
    categories: [],
    sharedBy: null,
    sharedByDisplayName: null,
  }
}

function folder(generation: number): NewsFolder {
  return { id: 1, parentId: null, name: `generation ${generation}`, opened: true }
}

beforeEach(async () => {
  await dbClear()
})
afterEach(() => vi.restoreAllMocks())

describe('reader snapshot', () => {
  it.each([0, 1, 250])('uses one readonly transaction for %i feeds', async (count) => {
    const db = await openDB('dripfeed', 2)
    try {
      const seed = db.transaction(['items', 'feeds', 'folders', 'meta'], 'readwrite')
      for (let id = 1; id <= count; id++) {
        void seed.objectStore('feeds').put(feed(id))
        // Feed 1 has no cursor; feed 2 is explicitly drained.
        if (id > 1) {
          void seed.objectStore('meta').put({
            key: `cursor:${id}`,
            value: String(id === 2 ? -1 : id * 10),
          })
        }
      }
      void seed.objectStore('meta').put({ key: 'cursor:9999', value: '123' })
      void seed.objectStore('meta').put({ key: 'initialized', value: '1' })
      await seed.done

      const transactions = vi.spyOn(IDBDatabase.prototype, 'transaction')
      const snapshot = await dbGetReaderSnapshot()
      expect(transactions.mock.calls).toEqual([[['items', 'feeds', 'folders', 'meta'], 'readonly']])
      expect(snapshot.feeds).toHaveLength(count)
      expect(snapshot.cursors.size).toBe(Math.max(0, count - 1))
      expect(snapshot.cursors.has(1)).toBe(false)
      expect(snapshot.cursors.has(9999)).toBe(false)
      if (count > 1) {
        expect(snapshot.cursors.get(2)).toBe(-1)
        expect(snapshot.cursors.get(count)).toBe(count * 10)
      }
    } finally {
      db.close()
    }
  })

  it('cannot mix generations when a writer is queued between the data and cursor reads', async () => {
    const db = await openDB('dripfeed', 2)
    const stores = ['items', 'feeds', 'folders', 'meta']
    const seed = db.transaction(stores, 'readwrite')
    void seed.objectStore('items').put(item(1))
    void seed.objectStore('feeds').put(feed(1))
    void seed.objectStore('folders').put(folder(1))
    void seed.objectStore('meta').put({ key: 'cursor:1', value: '1' })
    await seed.done

    const original = IDBDatabase.prototype.transaction
    let writerDone: Promise<void> | undefined
    let snapshotComplete = false
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
      this: IDBDatabase,
      names,
      mode,
      options,
    ) {
      const tx = original.call(this, names, mode, options)
      if (mode === 'readonly') {
        tx.addEventListener('complete', () => {
          snapshotComplete = true
        })
        // This writer is queued before snapshot cursor requests even exist.
        // It must wait for the entire readonly transaction, not just getAll.
        const writer = original.call(this, stores, 'readwrite')
        writer.objectStore('items').put(item(2))
        writer.objectStore('feeds').put(feed(1, 2))
        writer.objectStore('folders').put(folder(2))
        writer.objectStore('meta').put({ key: 'cursor:1', value: '2' })
        writerDone = new Promise<void>((resolve, reject) => {
          writer.addEventListener('complete', () => resolve())
          writer.addEventListener('abort', () => reject(writer.error))
        })
      }
      return tx
    })

    try {
      const before = await dbGetReaderSnapshot()
      expect(snapshotComplete).toBe(true)
      expect(before.items).toEqual([item(1)])
      expect(before.feeds).toEqual([feed(1)])
      expect(before.folders).toEqual([folder(1)])
      expect(before.cursors).toEqual(new Map([[1, 1]]))
      expect(writerDone).toBeDefined()
      await writerDone
      vi.restoreAllMocks()
      const after = await dbGetReaderSnapshot()
      expect(after.items).toEqual([item(2)])
      expect(after.feeds).toEqual([feed(1, 2)])
      expect(after.folders).toEqual([folder(2)])
      expect(after.cursors).toEqual(new Map([[1, 2]]))
    } finally {
      db.close()
    }
  })
})
