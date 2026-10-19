import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsFeed, NewsItem } from './api/types'
import { ItemMutationVersion, mergeServerItem } from './itemMutationVersion'

const mocks = vi.hoisted(() => ({
  feeds: [] as NewsFeed[],
  items: new Map<number, NewsItem>(),
  cursors: new Map<number, number>(),
  dbPutItems: vi.fn(),
  dbSetCursor: vi.fn(),
  dbInitCursor: vi.fn(),
  fetchMeta: vi.fn(),
  fetchItems: vi.fn(),
  fetchFeedWindow: vi.fn(),
  fetchUpdatedItems: vi.fn(),
}))

const versions = new ItemMutationVersion()

vi.mock('./db', () => ({
  dbClear: vi.fn(async () => {
    mocks.feeds = []
    mocks.items.clear()
    mocks.cursors.clear()
    versions.clear()
  }),
  dbGetAllFeeds: vi.fn(async () => mocks.feeds),
  dbGetFeedItems: vi.fn(async (feedId: number) =>
    [...mocks.items.values()].filter((item) => item.feedId === feedId),
  ),
  dbGetCursor: vi.fn(async (feedId: number) => mocks.cursors.get(feedId)),
  dbSetCursor: mocks.dbSetCursor,
  dbInitCursor: mocks.dbInitCursor,
  dbGetItemMutationVersion: vi.fn(() => versions.snapshot()),
  dbPutItems: mocks.dbPutItems,
  dbPutFeeds: vi.fn(async (feeds: NewsFeed[]) => {
    mocks.feeds = feeds
  }),
  dbPutFolders: vi.fn(async () => {}),
  dbGetMeta: vi.fn(async () => '100'),
  dbSetMeta: vi.fn(async () => {}),
}))

vi.mock('./api/sync', () => ({
  fetchMeta: mocks.fetchMeta,
  fetchFeedWindow: mocks.fetchFeedWindow,
  fetchUpdatedItems: mocks.fetchUpdatedItems,
  FEED_WINDOW: 20,
}))
vi.mock('./api/news', () => ({ fetchItems: mocks.fetchItems }))
vi.mock('./settings', () => ({ clearSettings: vi.fn() }))

const settings = { baseUrl: 'https://example.com', user: '', appPassword: '' }
const feed: NewsFeed = {
  id: 1,
  url: 'https://example.com/feed',
  title: 'New subscription',
  faviconLink: null,
  added: 0,
  folderId: null,
  unreadCount: 0,
  ordering: 0,
  link: null,
  pinned: false,
  fullTextEnabled: false,
  updateErrorCount: 0,
  lastUpdateError: null,
}

function item(id: number, feedId = feed.id): NewsItem {
  return {
    id,
    guid: String(id),
    guidHash: String(id),
    url: `https://example.com/${id}`,
    title: String(id),
    author: null,
    pubDate: id,
    updatedDate: null,
    body: '',
    enclosureMime: null,
    enclosureLink: null,
    mediaThumbnail: null,
    mediaDescription: null,
    feedId,
    unread: true,
    starred: false,
    filtered: false,
    lastModified: id,
    rtl: false,
    intro: null,
    fingerprint: null,
    categories: [],
    sharedBy: null,
    sharedByDisplayName: null,
  }
}

const window = Array.from({ length: 20 }, (_, index) => item(100 - index))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => vi.unstubAllGlobals())

beforeEach(() => {
  vi.resetAllMocks()
  mocks.feeds = []
  mocks.items.clear()
  mocks.cursors.clear()
  versions.clear()
  mocks.fetchMeta.mockResolvedValue({ feeds: [feed], folders: [] })
  mocks.fetchItems.mockResolvedValue({ items: [] })
  mocks.fetchUpdatedItems.mockResolvedValue({ items: [], serverTime: 100 })
  mocks.fetchFeedWindow.mockResolvedValue(window)
  mocks.dbInitCursor.mockImplementation(async (feedId: number, cursor: number) => {
    if (!mocks.cursors.has(feedId)) mocks.cursors.set(feedId, cursor)
  })
  mocks.dbSetCursor.mockImplementation(async (feedId: number, cursor: number) => {
    mocks.cursors.set(feedId, cursor)
  })
  mocks.dbPutItems.mockImplementation(async (items: NewsItem[], version: number) => {
    for (const item of items) {
      mocks.items.set(
        item.id,
        mergeServerItem(item, mocks.items.get(item.id), versions.changedSince(item.id, version)),
      )
    }
  })
})

describe('incremental sync feed history', () => {
  it('hydrates a discovered feed outside the newest-500 and pages its older history', async () => {
    // A busy existing feed fills the global poll; the subscription is older.
    const existingFeed = { ...feed, id: 2 }
    mocks.feeds = [existingFeed]
    mocks.cursors.set(existingFeed.id, 500)
    mocks.fetchMeta.mockResolvedValue({ feeds: [existingFeed, feed], folders: [] })
    mocks.fetchItems.mockResolvedValue({
      items: Array.from({ length: 500 }, (_, index) => item(2000 - index, existingFeed.id)),
    })
    mocks.fetchFeedWindow.mockResolvedValueOnce(window).mockResolvedValueOnce([item(80)])
    const { incrementalSync, loadMoreInto } = await import('./store')

    await incrementalSync(settings)
    const added = await loadMoreInto(settings, [feed.id])

    expect(added).toBe(1)
    expect(mocks.fetchFeedWindow).toHaveBeenNthCalledWith(1, settings, feed.id)
    expect(mocks.fetchFeedWindow).toHaveBeenNthCalledWith(2, settings, feed.id, 81)
    expect(mocks.items.get(100)).toMatchObject({ pubDate: 100000, lastModified: 100000 })
    expect(mocks.items.has(80)).toBe(true)
    expect(mocks.cursors.get(existingFeed.id)).toBe(500)
    expect(mocks.cursors.get(feed.id)).toBe(-1)
    expect(mocks.fetchUpdatedItems).toHaveBeenCalledOnce()
  })

  it.each([0, 81, -1])(
    'does not rehydrate a feed with an existing cursor of %s',
    async (cursor) => {
      mocks.cursors.set(feed.id, cursor)
      const { incrementalSync } = await import('./store')

      await incrementalSync(settings)

      expect(mocks.fetchFeedWindow).not.toHaveBeenCalled()
      expect(mocks.dbSetCursor).not.toHaveBeenCalled()
      expect(mocks.dbInitCursor).not.toHaveBeenCalled()
      expect(mocks.cursors.get(feed.id)).toBe(cursor)
    },
  )

  it.each([
    { name: 'empty', items: [] },
    { name: 'short', items: [item(100), item(99)] },
  ])('drains a $name initial window', async ({ items }) => {
    mocks.fetchFeedWindow.mockResolvedValue(items)
    const { incrementalSync, loadMoreInto } = await import('./store')

    await incrementalSync(settings)
    await incrementalSync(settings)

    expect(mocks.cursors.get(feed.id)).toBe(-1)
    expect(mocks.fetchFeedWindow).toHaveBeenCalledOnce()
    expect(await loadMoreInto(settings, [feed.id])).toBe(0)
  })

  it.each([
    { name: 'drained', page: [item(80)], cursor: -1 },
    {
      name: 'advanced',
      page: Array.from({ length: 20 }, (_, index) => item(80 - index)),
      cursor: 61,
    },
  ])('preserves the $name cursor when a slower refresh finishes', async ({ page, cursor }) => {
    const pending = deferred<NewsItem[]>()
    mocks.fetchFeedWindow
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(window)
      .mockResolvedValueOnce(page)
    const { incrementalSync, loadMoreInto } = await import('./store')
    const slowSync = incrementalSync(settings)
    await vi.waitFor(() => expect(mocks.fetchFeedWindow).toHaveBeenCalledOnce())

    await incrementalSync(settings)
    expect(mocks.cursors.get(feed.id)).toBe(81)
    expect(await loadMoreInto(settings, [feed.id], 1)).toBe(page.length)
    expect(mocks.cursors.get(feed.id)).toBe(cursor)

    pending.resolve(window)
    await slowSync

    expect(mocks.cursors.get(feed.id)).toBe(cursor)
  })

  it('derives the cursor only from the feed window, not older starred or delta items', async () => {
    mocks.fetchItems.mockResolvedValue({ items: [{ ...item(1), starred: true }] })
    mocks.fetchUpdatedItems.mockResolvedValue({ items: [item(2)], serverTime: 100 })
    const { incrementalSync } = await import('./store')

    await incrementalSync(settings)

    expect(mocks.items.has(1)).toBe(true)
    expect(mocks.items.has(2)).toBe(true)
    expect(mocks.cursors.get(feed.id)).toBe(81)
  })

  it('retries missing history after a failed fetch even though the feed metadata was saved', async () => {
    mocks.fetchFeedWindow.mockRejectedValueOnce(new Error('window fetch failed'))
    const { incrementalSync } = await import('./store')

    await expect(incrementalSync(settings)).rejects.toThrow('window fetch failed')
    expect(mocks.feeds).toEqual([feed])
    expect(mocks.cursors.has(feed.id)).toBe(false)

    await incrementalSync(settings)

    expect(mocks.fetchFeedWindow).toHaveBeenCalledTimes(2)
    expect(mocks.cursors.get(feed.id)).toBe(81)
  })

  it('discards a feed-window response arriving after reset', async () => {
    const pending = deferred<NewsItem[]>()
    mocks.fetchFeedWindow.mockReturnValue(pending.promise)
    vi.stubGlobal('localStorage', { removeItem: vi.fn() })
    const { incrementalSync, resetLocal } = await import('./store')
    const sync = incrementalSync(settings)
    await vi.waitFor(() => expect(mocks.fetchFeedWindow).toHaveBeenCalledOnce())
    mocks.dbPutItems.mockClear()

    await resetLocal()
    pending.resolve(window)
    await sync

    expect(mocks.dbPutItems).not.toHaveBeenCalled()
    expect(mocks.dbSetCursor).not.toHaveBeenCalled()
    expect(mocks.dbInitCursor).not.toHaveBeenCalled()
    expect(mocks.items.size).toBe(0)
    expect(mocks.cursors.size).toBe(0)
    expect(mocks.fetchUpdatedItems).not.toHaveBeenCalled()
  })

  it('does not write a cursor if reset occurs during the feed-window item write', async () => {
    const pending = deferred<void>()
    mocks.dbPutItems.mockImplementationOnce(async () => {})
    mocks.dbPutItems.mockImplementationOnce(() => pending.promise)
    vi.stubGlobal('localStorage', { removeItem: vi.fn() })
    const { incrementalSync, resetLocal } = await import('./store')
    const sync = incrementalSync(settings)
    await vi.waitFor(() => expect(mocks.dbPutItems).toHaveBeenCalledTimes(2))

    await resetLocal()
    pending.resolve()
    await sync

    expect(mocks.dbSetCursor).not.toHaveBeenCalled()
    expect(mocks.dbInitCursor).not.toHaveBeenCalled()
    expect(mocks.fetchUpdatedItems).not.toHaveBeenCalled()
  })

  it('preserves a local read/star mutation made while the feed window is in flight', async () => {
    const pending = deferred<NewsItem[]>()
    mocks.fetchItems.mockResolvedValue({ items: [item(100)] })
    mocks.fetchFeedWindow.mockReturnValue(pending.promise)
    const { incrementalSync } = await import('./store')
    const sync = incrementalSync(settings)
    await vi.waitFor(() => expect(mocks.fetchFeedWindow).toHaveBeenCalledOnce())

    const requestVersion = versions.snapshot()
    mocks.items.set(100, { ...mocks.items.get(100)!, unread: false, starred: true })
    versions.mark(100)
    pending.resolve(window)
    await sync

    expect(mocks.dbPutItems).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 100, pubDate: 100000 })]),
      requestVersion,
    )
    expect(mocks.items.get(100)).toMatchObject({ unread: false, starred: true })
    expect(mocks.cursors.get(feed.id)).toBe(81)
  })
})
