import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsFeed, NewsItem } from './api/types'
import { setFeedFullText, setRead, setStar } from './actions'

const mocks = vi.hoisted(() => ({
  items: new Map<number, NewsItem>(),
  feeds: new Map<number, NewsFeed>(),
  markRead: vi.fn<() => Promise<void>>(),
  markUnread: vi.fn<() => Promise<void>>(),
  setStar: vi.fn<() => Promise<void>>(),
  setFeedFullText: vi.fn<() => Promise<void>>(),
}))

// Exercise the production actions and queue, replacing only persistence and IO.
vi.mock('./db', () => ({
  dbUpdateItem: vi.fn(async (id: number, update: (item: NewsItem) => NewsItem) => {
    const previous = mocks.items.get(id)
    const next = previous ? update(previous) : undefined
    if (next) mocks.items.set(id, next)
    return { previous, next }
  }),
  dbSetItemUnread: vi.fn(async (id: number, unread: boolean) => {
    const item = mocks.items.get(id)
    if (!item) return
    mocks.items.set(id, { ...item, unread })
    const feed = mocks.feeds.get(item.feedId)
    if (feed && item.unread !== unread) {
      mocks.feeds.set(feed.id, {
        ...feed,
        unreadCount: Math.max(0, feed.unreadCount + (unread ? 1 : -1)),
      })
    }
  }),
  dbUpdateFeed: vi.fn(async (id: number, update: (feed: NewsFeed) => NewsFeed) => {
    const previous = mocks.feeds.get(id)
    const next = previous ? update(previous) : undefined
    if (next) mocks.feeds.set(id, next)
    return { previous, next }
  }),
  dbGetFeed: vi.fn(async (id: number) => mocks.feeds.get(id)),
  dbGetFeedItems: vi.fn(),
  dbPutItem: vi.fn(),
}))
vi.mock('./api/news', () => ({
  markRead: mocks.markRead,
  markUnread: mocks.markUnread,
  setStar: mocks.setStar,
  setFeedFullText: mocks.setFeedFullText,
  markFeedRead: vi.fn(),
  fetchFulltext: vi.fn(),
}))
vi.mock('./store', () => ({ notifyLocalChange: vi.fn(), normalizeItem: vi.fn() }))

const settings = { baseUrl: '', user: 'test', appPassword: 'test' }
let nextId = 0

function fixture() {
  const id = ++nextId
  const item: NewsItem = {
    id,
    guid: 'guid',
    guidHash: 'hash',
    url: 'https://example.com',
    title: 'item',
    author: null,
    pubDate: null,
    updatedDate: null,
    body: '',
    enclosureMime: null,
    enclosureLink: null,
    mediaThumbnail: null,
    mediaDescription: null,
    feedId: id,
    unread: false,
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
  const feed: NewsFeed = {
    id,
    url: 'https://example.com/feed',
    title: 'feed',
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
  mocks.items.set(id, item)
  mocks.feeds.set(id, feed)
  return id
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  mocks.items.clear()
  mocks.feeds.clear()
  for (const mock of [mocks.markRead, mocks.markUnread, mocks.setStar, mocks.setFeedFullText]) {
    mock.mockReset().mockResolvedValue(undefined)
  }
})

for (const field of ['unread', 'starred', 'fullTextEnabled'] as const) {
  describe(`${field} action rollback`, () => {
    function value(id: number): boolean {
      return field === 'fullTextEnabled'
        ? mocks.feeds.get(id)!.fullTextEnabled
        : mocks.items.get(id)![field]
    }

    function act(id: number, next: boolean): Promise<void> {
      if (field === 'fullTextEnabled') return setFeedFullText(settings, id, next)
      const item = mocks.items.get(id)!
      return field === 'unread' ? setRead(settings, item, next) : setStar(settings, item, next)
    }

    function refresh(id: number) {
      // An authoritative refresh replaces the row after the first action settles.
      if (field === 'fullTextEnabled') {
        mocks.feeds.set(id, { ...mocks.feeds.get(id)!, fullTextEnabled: false })
      } else {
        mocks.items.set(id, { ...mocks.items.get(id)!, [field]: false })
        if (field === 'unread') {
          mocks.feeds.set(id, { ...mocks.feeds.get(id)!, unreadCount: 0 })
        }
      }
    }

    function sends() {
      return field === 'unread'
        ? [mocks.markUnread, mocks.markRead]
        : field === 'starred'
          ? [mocks.setStar, mocks.setStar]
          : [mocks.setFeedFullText, mocks.setFeedFullText]
    }

    it('restores the refreshed value after a previous successful mutation', async () => {
      const id = fixture()
      await act(id, true)
      expect(value(id)).toBe(true)
      refresh(id)
      const [send] = sends()
      send.mockRejectedValueOnce(new Error('request failed'))

      await expect(act(id, true)).rejects.toThrow('request failed')

      expect(value(id)).toBe(false)
      if (field === 'unread') expect(mocks.feeds.get(id)!.unreadCount).toBe(0)
    })

    it.each([
      [false, false],
      [true, false],
      [false, true],
    ])(
      'keeps the active queue baseline (first succeeds: %s, second succeeds: %s)',
      async (firstSucceeds, secondSucceeds) => {
        const id = fixture()
        const firstRequest = deferred()
        const secondRequest = deferred()
        const [sendFirst, sendSecond] = sends()
        sendFirst.mockImplementationOnce(() => firstRequest.promise)
        sendSecond.mockImplementationOnce(() => secondRequest.promise)

        const first = act(id, true)
        const firstResult = firstSucceeds
          ? expect(first).resolves.toBeUndefined()
          : expect(first).rejects.toThrow('first failed')
        await vi.waitFor(() => expect(sendFirst).toHaveBeenCalledOnce())
        const second = act(id, false)
        const secondResult = secondSucceeds
          ? expect(second).resolves.toBeUndefined()
          : expect(second).rejects.toThrow('second failed')
        await vi.waitFor(() => expect(value(id)).toBe(false))
        // A replacement queue would send the second request before the first settles.
        expect(
          sendFirst.mock.calls.length +
            (sendFirst === sendSecond ? 0 : sendSecond.mock.calls.length),
        ).toBe(1)

        if (firstSucceeds) firstRequest.resolve()
        else firstRequest.reject(new Error('first failed'))
        await firstResult
        await vi.waitFor(() => {
          const calls =
            sendFirst.mock.calls.length +
            (sendFirst === sendSecond ? 0 : sendSecond.mock.calls.length)
          expect(calls).toBe(2)
        })
        expect(value(id)).toBe(false)
        if (secondSucceeds) secondRequest.resolve()
        else secondRequest.reject(new Error('second failed'))
        await secondResult

        const expected = firstSucceeds && !secondSucceeds
        expect(value(id)).toBe(expected)
        if (field === 'unread') expect(mocks.feeds.get(id)!.unreadCount).toBe(Number(expected))
      },
    )
  })
}
