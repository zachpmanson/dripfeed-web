import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsFeed, NewsItem } from './api/types'

const mocks = vi.hoisted(() => ({
  dbGetAllFeeds: vi.fn<() => Promise<NewsFeed[]>>(),
  dbGetCursor: vi.fn<(feedId: number) => Promise<number | undefined>>(),
  dbGetFeedItems: vi.fn<(feedId: number) => Promise<NewsItem[]>>(),
  dbGetItemMutationVersion: vi.fn(() => 0),
  dbPutItems: vi.fn<(items: NewsItem[], mutationVersion: number) => Promise<void>>(),
  dbSetCursor: vi.fn<(feedId: number, cursor: number) => Promise<void>>(),
  fetchFeedWindow:
    vi.fn<(settings: unknown, feedId: number, beforeId: number) => Promise<NewsItem[]>>(),
}))

vi.mock('./db', () => ({
  dbGetAllFeeds: mocks.dbGetAllFeeds,
  dbGetCursor: mocks.dbGetCursor,
  dbGetFeedItems: mocks.dbGetFeedItems,
  dbGetItemMutationVersion: mocks.dbGetItemMutationVersion,
  dbPutItems: mocks.dbPutItems,
  dbSetCursor: mocks.dbSetCursor,
}))

vi.mock('./api/sync', () => ({
  fetchFeedWindow: mocks.fetchFeedWindow,
  FEED_WINDOW: 20,
}))

import { loadMoreInto, normalizeItem } from './store'

const settings = { baseUrl: '', user: '', appPassword: '' }
const feed: NewsFeed = {
  id: 7,
  url: '',
  title: 'Test feed',
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

function item(id: number): NewsItem {
  return {
    id,
    guid: String(id),
    guidHash: String(id),
    url: '',
    title: String(id),
    author: null,
    pubDate: id,
    updatedDate: null,
    body: '',
    enclosureMime: null,
    enclosureLink: null,
    mediaThumbnail: null,
    mediaDescription: null,
    feedId: feed.id,
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

const stored = new Map<number, NewsItem>()
const cursors = new Map<number, number>()
let history: NewsItem[]

beforeEach(() => {
  vi.clearAllMocks()
  stored.clear()
  cursors.clear()
  cursors.set(feed.id, 100)
  for (let id = 100; id < 120; id++) stored.set(id, normalizeItem(item(id)))
  history = Array.from({ length: 60 }, (_, index) => item(99 - index))
  mocks.dbGetAllFeeds.mockResolvedValue([feed])
  mocks.dbGetCursor.mockImplementation(async (feedId) => cursors.get(feedId))
  mocks.dbGetFeedItems.mockImplementation(async (feedId) =>
    [...stored.values()].filter((entry) => entry.feedId === feedId),
  )
  mocks.dbPutItems.mockImplementation(async (items) => {
    for (const entry of items) stored.set(entry.id, entry)
  })
  mocks.dbSetCursor.mockImplementation(async (feedId, cursor) => {
    cursors.set(feedId, cursor)
  })
  // Match the API's exclusive ID boundary; repeated cursors return repeated rows.
  mocks.fetchFeedWindow.mockImplementation(async (_settings, feedId, beforeId) =>
    history.filter((entry) => entry.feedId === feedId && entry.id < beforeId).slice(0, 20),
  )
})

function requestedCursors(): number[] {
  return mocks.fetchFeedWindow.mock.calls.map(([, , cursor]) => cursor)
}

describe('loadMoreInto paging', () => {
  it('advances the live cursor through three distinct pages in one default invocation', async () => {
    const onProgress = vi.fn()

    expect(await loadMoreInto(settings, [feed.id], undefined, onProgress)).toBe(60)

    expect(requestedCursors()).toEqual([100, 80, 60])
    expect(mocks.dbSetCursor.mock.calls).toEqual([
      [feed.id, 80],
      [feed.id, 60],
      [feed.id, 40],
    ])
    expect(stored.size).toBe(80)
    expect(history.every((entry) => stored.has(entry.id))).toBe(true)
    expect(cursors.get(feed.id)).toBe(40)
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { added: 20, feedsPaged: 1, totalFeeds: 1 },
      { added: 40, feedsPaged: 2, totalFeeds: 1 },
      { added: 60, feedsPaged: 3, totalFeeds: 1 },
    ])
  })

  it('stops at a short final page and skips the exhausted feed on later invocations', async () => {
    history = history.slice(0, 25)

    expect(await loadMoreInto(settings, [feed.id])).toBe(25)
    expect(requestedCursors()).toEqual([100, 80])
    expect(stored.size).toBe(45)
    expect(cursors.get(feed.id)).toBe(-1)
    expect(await loadMoreInto(settings, [feed.id])).toBe(0)
    expect(mocks.fetchFeedWindow).toHaveBeenCalledTimes(2)
  })

  it('stops at an empty page after a full page and keeps exhaustion persisted', async () => {
    history = history.slice(0, 20)

    expect(await loadMoreInto(settings, [feed.id])).toBe(20)
    expect(requestedCursors()).toEqual([100, 80])
    expect(stored.size).toBe(40)
    expect(cursors.get(feed.id)).toBe(-1)
    expect(await loadMoreInto(settings, [feed.id])).toBe(0)
    expect(mocks.fetchFeedWindow).toHaveBeenCalledTimes(2)
  })
})
