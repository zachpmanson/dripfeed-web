import { describe, expect, it } from 'vitest'
import type { NewsFeed, NewsItem } from './api/types'
import { buildAppViewModel } from './appViewModel'

const feed: NewsFeed = {
  id: 1,
  url: 'https://example.com/rss',
  title: 'Example',
  faviconLink: null,
  added: 0,
  folderId: 7,
  unreadCount: 0,
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
    url: `https://example.com/${id}`,
    title: String(id),
    author: null,
    pubDate: id * 1000,
    updatedDate: null,
    body: `body-${id}`,
    enclosureMime: null,
    enclosureLink: null,
    mediaThumbnail: null,
    mediaDescription: null,
    feedId: 1,
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

const base = {
  pool: [item(1), item(2, false)],
  feeds: new Map([[feed.id, feed]]),
  cursors: new Map([[feed.id, 12]]),
  view: { kind: 'feed', id: feed.id } as const,
  showMode: 'unread' as const,
  sortMode: 'newest' as const,
  selectedId: 2,
  unreadDrained: new Set<string>(),
  unreadProbing: false,
}

describe('buildAppViewModel', () => {
  it('builds folder membership and preserves a selected item outside the current filter', () => {
    const model = buildAppViewModel(base)

    expect(model.feedOfFolder.get(7)).toEqual(new Set([1]))
    expect(model.visibleItems.map((entry) => entry.id)).toEqual([1])
    expect(model.selected?.id).toBe(2)
    expect(model.recentBodies).toContain('body-2')
    expect(model.viewKey).toBe('feed:1:unread:newest')
  })

  it('marks a completed unread probe as drained and suppresses history paging', () => {
    const model = buildAppViewModel({
      ...base,
      unreadDrained: new Set(['feed:1']),
      unreadProbing: true,
    })

    expect(model.moreServer).toBe(false)
    expect(model.drained).toBe(true)
    expect(model.unreadProbing).toBe(false)
  })

  it('treats an empty folder as drained', () => {
    const model = buildAppViewModel({
      ...base,
      view: { kind: 'folder', id: 99 },
      selectedId: null,
    })

    expect(model.moreServer).toBe(false)
    expect(model.drained).toBe(true)
  })
})
