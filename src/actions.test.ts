import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsFeed, NewsItem } from './api/types'

const api = vi.hoisted(() => ({
  markFeedRead: vi.fn(),
  markRead: vi.fn(async () => {}),
  markUnread: vi.fn(async () => {}),
  setStar: vi.fn(async () => {}),
  setFeedFullText: vi.fn(async () => {}),
  fetchFulltext: vi.fn(),
}))
vi.mock('./api/news', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/news')>()),
  ...api,
}))

const settings = { baseUrl: '', user: '', appPassword: '' }
const feed: NewsFeed = {
  id: 1,
  url: '',
  title: 'Feed',
  faviconLink: null,
  added: 0,
  folderId: null,
  unreadCount: 8,
  ordering: 0,
  link: null,
  pinned: false,
  fullTextEnabled: false,
  updateErrorCount: 0,
  lastUpdateError: null,
}
function item(id: number, unread = true): NewsItem {
  return {
    id,
    guid: String(id),
    guidHash: String(id),
    url: '',
    title: `Item ${id}`,
    author: null,
    pubDate: null,
    updatedDate: null,
    body: 'Original body',
    enclosureMime: null,
    enclosureLink: null,
    mediaThumbnail: null,
    mediaDescription: null,
    feedId: feed.id,
    unread,
    starred: false,
    filtered: false,
    lastModified: 0,
    rtl: false,
    intro: null,
    fingerprint: null,
    categories: [],
    sharedBy: null,
    sharedByDisplayName: null,
  }
}

let db: typeof import('./db')
let actions: typeof import('./actions')
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  db = await import('./db')
  actions = await import('./actions')
  await db.dbClear()
  await db.dbPutFeed(feed)
  await db.dbPutItems([item(1), item(2, false), item(3)])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function pendingBulk() {
  let reject!: (error: Error) => void
  api.markFeedRead.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, rejectRequest) => {
        reject = rejectRequest
      }),
  )
  const result = actions.markFeedAllRead(settings, feed.id).catch((error: unknown) => error)
  await vi.waitFor(() => expect(api.markFeedRead).toHaveBeenCalledOnce())
  expect((await db.dbGetFeed(feed.id))?.unreadCount).toBe(0)
  return {
    async fail() {
      const error = new Error('bulk request failed')
      reject(error)
      expect(await result).toBe(error)
    },
  }
}

function onNextWriteSuccess(storeName: string, callback: (tx: IDBTransaction) => void) {
  const original = IDBObjectStore.prototype.put
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    const request = original.apply(this, args)
    if (this.name === storeName) {
      spy.mockRestore()
      request.addEventListener('success', () => callback(this.transaction))
    }
    return request
  })
  return () => spy.mockRestore()
}

function abortNextWrite(storeName: string) {
  return onNextWriteSuccess(storeName, (tx) => {
    // Let the helper observe request success before aborting the transaction.
    queueMicrotask(() => queueMicrotask(() => tx.abort()))
  })
}

// Real actions + IndexedDB + existing mutation-version protection; only HTTP is mocked.
describe('failed bulk-read rollback', () => {
  const abortedWrites = [
    ['explicit no-op read', 'items', () => db.dbSetItemUnread(1, false)],
    ['item sync', 'items', () => db.dbPutItems([item(1, false)])],
    ['feed sync', 'feeds', () => db.dbPutFeeds([{ ...feed, unreadCount: 42 }])],
    ['item update', 'items', () => db.dbUpdateItem(1, (row) => ({ ...row, unread: true }))],
    ['feed update', 'feeds', () => db.dbUpdateFeed(1, (row) => ({ ...row, unreadCount: 42 }))],
  ] as const

  it.each(abortedWrites)(
    'retains rollback ownership after aborted %s',
    async (_name, store, write) => {
      const bulk = await pendingBulk()
      const version = db.dbGetItemMutationVersion()
      const restore = abortNextWrite(store)
      try {
        await expect(write()).rejects.toMatchObject({ name: 'AbortError' })
      } finally {
        restore()
      }
      expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([false, false, false])
      expect((await db.dbGetFeed(1))?.unreadCount).toBe(0)
      const versionAfterAbort = db.dbGetItemMutationVersion()
      await bulk.fail()
      expect(versionAfterAbort).toBe(version)
      expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([true, false, true])
      expect((await db.dbGetFeed(1))?.unreadCount).toBe(8)
      // Only the two committed rollback writes may advance the mutation version.
      expect(db.dbGetItemMutationVersion()).toBe(version + 2)
    },
  )

  it('publishes bulk ownership before later queued read intent revokes it', async () => {
    const begin = db.dbBeginFeedRead(1, db.dbGetGeneration())
    const intent = db.dbSetItemUnread(1, false)
    const [bulk] = await Promise.all([begin, intent])
    await bulk!.rollback()
    bulk!.finish()
    expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([false, false, true])
    expect((await db.dbGetFeed(1))?.unreadCount).toBe(7)
  })

  it('checks stale-sync versions after earlier queued writes commit', async () => {
    const version = db.dbGetItemMutationVersion()
    const begin = db.dbBeginFeedRead(1, db.dbGetGeneration())
    const sync = db.dbPutItems([{ ...item(1), body: 'Refreshed body' }], version)
    const [bulk] = await Promise.all([begin, sync])
    expect((await db.dbGetAllItems())[0]).toMatchObject({ unread: false, body: 'Refreshed body' })
    await bulk!.rollback()
    bulk!.finish()
    expect((await db.dbGetAllItems())[0]).toMatchObject({ unread: true, body: 'Refreshed body' })
    expect((await db.dbGetFeed(1))?.unreadCount).toBe(8)
  })

  it.each(['begin', 'rollback'])(
    'does not publish bulk %s bookkeeping after reset',
    async (phase) => {
      const generation = db.dbGetGeneration()
      const bulk = phase === 'rollback' ? await db.dbBeginFeedRead(1, generation) : undefined
      let reset!: Promise<void>
      const restore = onNextWriteSuccess('feeds', () => {
        reset = db.dbClear()
      })
      try {
        if (bulk) await bulk.rollback()
        else expect(await db.dbBeginFeedRead(1, generation)).toBeUndefined()
        await reset
      } finally {
        restore()
        bulk?.finish()
      }
      expect(await db.dbGetAllItems()).toEqual([])
      expect(await db.dbGetAllFeeds()).toEqual([])
      expect(db.dbGetItemMutationVersion()).toBe(0)
    },
  )

  it('allows other feeds, individual intent, and sync to commit during pending bulk HTTP', async () => {
    const otherFeed = { ...feed, id: 2, unreadCount: 9 }
    await db.dbPutFeed(otherFeed)
    await db.dbPutItems([{ ...item(4), feedId: 2 }])
    const bulk = await pendingBulk()
    api.markFeedRead.mockResolvedValueOnce(undefined)
    await actions.markFeedAllRead(settings, 2)
    await actions.setRead(settings, item(1, false), false)
    await db.dbPutItems([item(3, false)])
    await db.dbPutFeeds([{ ...feed, unreadCount: 42 }, otherFeed])
    await bulk.fail()
    expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([
      false,
      false,
      false,
      false,
    ])
    expect((await db.dbGetAllFeeds()).map(({ unreadCount }) => unreadCount)).toEqual([42, 9])
  })

  it('does not publish an aborted bulk begin', async () => {
    const version = db.dbGetItemMutationVersion()
    const restore = abortNextWrite('feeds')
    try {
      await expect(db.dbBeginFeedRead(1, db.dbGetGeneration())).rejects.toMatchObject({
        name: 'AbortError',
      })
    } finally {
      restore()
    }
    expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([true, false, true])
    expect((await db.dbGetFeed(1))?.unreadCount).toBe(8)
    expect(db.dbGetItemMutationVersion()).toBe(version)
    const bulk = await pendingBulk()
    await bulk.fail()
    expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([true, false, true])
    expect((await db.dbGetFeed(1))?.unreadCount).toBe(8)
  })

  it('retains ownership and versions when bulk rollback aborts', async () => {
    const bulk = await db.dbBeginFeedRead(1, db.dbGetGeneration())
    expect(bulk).toBeDefined()
    const version = db.dbGetItemMutationVersion()
    const restore = abortNextWrite('feeds')
    try {
      await expect(bulk!.rollback()).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      restore()
    }
    expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([false, false, false])
    expect((await db.dbGetFeed(1))?.unreadCount).toBe(0)
    expect(db.dbGetItemMutationVersion()).toBe(version)
    await bulk!.rollback()
    bulk!.finish()
    expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([true, false, true])
    expect((await db.dbGetFeed(1))?.unreadCount).toBe(8)
  })

  it('preserves later explicit read and unread intent, including a no-op read', async () => {
    const bulk = await pendingBulk()
    await actions.setRead(settings, item(1, false), false)
    await actions.setRead(settings, item(2, false), true)
    await bulk.fail()

    expect((await db.dbGetAllItems()).map(({ id, unread }) => [id, unread])).toEqual([
      [1, false],
      [2, true],
      [3, true],
    ])
    expect((await db.dbGetFeed(feed.id))?.unreadCount).toBe(8)
  })

  it('restores only the badge contribution not superseded by a later read', async () => {
    const bulk = await pendingBulk()
    await actions.setRead(settings, item(1, false), false)
    await bulk.fail()

    // Six unread items are outside the local window; item 3 is restored, item 1 stays read.
    expect((await db.dbGetFeed(feed.id))?.unreadCount).toBe(7)
  })

  it('does not overwrite authoritative item and badge sync while the request is pending', async () => {
    const bulk = await pendingBulk()
    const version = db.dbGetItemMutationVersion()
    await db.dbPutItems([item(1, false), item(2, true)], version)
    await db.dbPutFeeds([{ ...feed, unreadCount: 42, title: 'Synced feed' }])
    await bulk.fail()

    expect((await db.dbGetAllItems()).map(({ id, unread }) => [id, unread])).toEqual([
      [1, false],
      [2, true],
      [3, true],
    ])
    expect(await db.dbGetFeed(feed.id)).toMatchObject({ unreadCount: 42, title: 'Synced feed' })
  })

  it('serializes overlapping failed bulks and snapshots after the prior rollback', async () => {
    const first = await pendingBulk()
    let rejectSecond!: (error: Error) => void
    api.markFeedRead.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSecond = reject
        }),
    )
    const second = actions.markFeedAllRead(settings, feed.id).catch((error: unknown) => error)
    expect(api.markFeedRead).toHaveBeenCalledOnce()
    await first.fail()
    await vi.waitFor(() => expect(api.markFeedRead).toHaveBeenCalledTimes(2))
    expect((await db.dbGetFeed(feed.id))?.unreadCount).toBe(0)
    const error = new Error('second bulk failed')
    rejectSecond(error)
    expect(await second).toBe(error)
    expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([true, false, true])
    expect((await db.dbGetFeed(feed.id))?.unreadCount).toBe(8)
  })

  it('does not roll back or execute queued bulk work after a database reset', async () => {
    const first = await pendingBulk()
    const second = actions.markFeedAllRead(settings, feed.id)
    await db.dbClear()
    await db.dbPutFeed({ ...feed, unreadCount: 21 })
    await db.dbPutItems([item(1, false)])
    await first.fail()
    await second
    expect(api.markFeedRead).toHaveBeenCalledOnce()
    expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([false])
    expect((await db.dbGetFeed(feed.id))?.unreadCount).toBe(21)
  })

  it('keeps stale server responses from revoking optimistic read ownership', async () => {
    const version = db.dbGetItemMutationVersion()
    const bulk = await pendingBulk()
    await db.dbPutItems([item(1), item(3)], version)
    expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([false, false, false])
    await bulk.fail()
    expect((await db.dbGetAllItems()).map(({ unread }) => unread)).toEqual([true, false, true])
    expect((await db.dbGetFeed(feed.id))?.unreadCount).toBe(8)
  })

  it('restores the whole badge even when the local mirror has no unread items', async () => {
    await db.dbPutItems([item(1, false), item(3, false)])
    const bulk = await pendingBulk()
    await bulk.fail()
    expect((await db.dbGetFeed(feed.id))?.unreadCount).toBe(8)
  })

  it('does not restore a synced badge even if its new value is still zero', async () => {
    const bulk = await pendingBulk()
    await db.dbPutFeeds([{ ...feed, unreadCount: 0 }])
    await bulk.fail()
    expect((await db.dbGetFeed(feed.id))?.unreadCount).toBe(0)
  })

  it('still rolls back read state without clobbering star, article, or feed settings', async () => {
    const bulk = await pendingBulk()
    await actions.setStar(settings, item(1, false), true)
    api.fetchFulltext.mockResolvedValueOnce({ ...item(1, false), body: 'Extracted body' })
    await actions.extractFulltext(settings, item(1, false))
    await actions.setFeedFullText(settings, feed.id, true)
    await bulk.fail()

    expect((await db.dbGetAllItems())[0]).toMatchObject({
      unread: true,
      starred: true,
      body: 'Extracted body',
    })
    expect(await db.dbGetFeed(feed.id)).toMatchObject({ unreadCount: 8, fullTextEnabled: true })
  })
})

describe('fulltext response persistence', () => {
  function pendingExtraction() {
    let resolve!: (row: NewsItem) => void
    api.fetchFulltext.mockReturnValueOnce(
      new Promise<NewsItem>((resolveRequest) => {
        resolve = resolveRequest
      }),
    )
    const result = actions.extractFulltext(settings, item(1))
    expect(api.fetchFulltext).toHaveBeenCalledOnce()
    return { result, resolve }
  }

  async function reset() {
    vi.stubGlobal('localStorage', { removeItem: vi.fn() })
    await (await import('./store')).resetLocal()
  }

  const extracted = { ...item(1), body: 'Extracted body', pubDate: 123, lastModified: 456 }

  it('does not repopulate any store when a response arrives after resetLocal', async () => {
    const request = pendingExtraction()
    await reset()
    request.resolve(extracted)
    await request.result
    expect(await db.dbGetAllItems()).toEqual([])
    expect(await db.dbGetAllFeeds()).toEqual([])
    expect(await db.dbGetAllFolders()).toEqual([])
  })

  it('leaves a replacement-account row with the same ID entirely untouched', async () => {
    const request = pendingExtraction()
    await reset()
    const replacement = { ...item(1, false), title: 'Replacement account', body: 'Private body' }
    await db.dbPutFeed({ ...feed, title: 'Replacement feed' })
    await db.dbPutItem(replacement)
    request.resolve(extracted)
    await request.result
    expect(await db.dbGetAllItems()).toEqual([replacement])
    expect(await db.dbGetFeed(feed.id)).toEqual({ ...feed, title: 'Replacement feed' })
  })

  it('does not resurrect an item removed with its feed while HTTP is pending', async () => {
    const request = pendingExtraction()
    await db.dbPutFeeds([])
    request.resolve(extracted)
    await request.result
    expect(await db.dbGetAllItems()).toEqual([])
    expect(await db.dbGetAllFeeds()).toEqual([])
  })

  it('serializes extraction behind an already queued feed deletion', async () => {
    const request = pendingExtraction()
    const deletion = db.dbPutFeeds([])
    request.resolve(extracted)
    await Promise.all([deletion, request.result])
    expect(await db.dbGetAllItems()).toEqual([])
    expect(await db.dbGetAllFeeds()).toEqual([])
  })

  it('stores normalized extraction while preserving the latest local read/star flags', async () => {
    const request = pendingExtraction()
    await actions.setRead(settings, item(1), false)
    await actions.setStar(settings, item(1, false), true)
    request.resolve(extracted)
    await request.result
    expect((await db.dbGetAllItems()).find((row) => row.id === 1)).toEqual({
      ...extracted,
      unread: false,
      starred: true,
      pubDate: 123000,
      lastModified: 456000,
    })
    expect((await db.dbGetFeed(feed.id))?.unreadCount).toBe(7)
  })

  it('still inserts an evicted item when its feed remains subscribed', async () => {
    const request = pendingExtraction()
    // Evict just this row, without deleting its feed or resetting the session.
    const { openDB } = await import('idb')
    const connection = await openDB('dripfeed')
    await connection.delete('items', 1)
    connection.close()
    request.resolve(extracted)
    await request.result
    expect((await db.dbGetAllItems()).find((row) => row.id === 1)).toEqual({
      ...extracted,
      pubDate: 123000,
      lastModified: 456000,
    })
  })

  it('discards a response if reset interleaves the database-open await', async () => {
    const request = pendingExtraction()
    const writes = vi.spyOn(IDBObjectStore.prototype, 'put')
    request.resolve(extracted)
    // Run the HTTP continuation, leaving persistence suspended at getDB().
    await Promise.resolve()
    await db.dbClear()
    await request.result
    expect(writes).not.toHaveBeenCalled()
    expect(await db.dbGetAllItems()).toEqual([])
  })

  it('discards a response if reset interleaves transactional reads', async () => {
    const request = pendingExtraction()
    const writes = vi.spyOn(IDBObjectStore.prototype, 'put')
    let resetDone!: Promise<void>
    const original = IDBObjectStore.prototype.get
    const spy = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['get']>
    ) {
      const read = original.apply(this, args)
      if (this.name === 'items') {
        spy.mockRestore()
        read.addEventListener('success', () => {
          resetDone = db.dbClear()
        })
      }
      return read
    })
    request.resolve(extracted)
    await request.result
    expect(resetDone).toBeDefined()
    await resetDone
    expect(writes).not.toHaveBeenCalled()
    expect(await db.dbGetAllItems()).toEqual([])
    expect(await db.dbGetAllFeeds()).toEqual([])
    expect(db.dbGetItemMutationVersion()).toBe(0)
  })
})
