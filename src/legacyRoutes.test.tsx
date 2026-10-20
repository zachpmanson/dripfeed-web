// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractFulltext } from './actions'
import type { NewsFeed, NewsItem } from './api/types'
import { FeedSettingsModal } from './components/feed/FeedSettingsModal'
import { ItemView } from './components/reader/ItemView'
import { dbClear, dbGetFeed, dbPutFeed } from './db'
import { fullSync, getStatus, isInitialized } from './store'

const settings = {
  baseUrl: 'https://other-cloud.example/nextcloud',
  user: 'remote-reader',
  appPassword: 'remote-secret',
}
const feed: NewsFeed = {
  id: 456,
  url: 'https://example.com/feed',
  title: 'Feed',
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
const item: NewsItem = {
  id: 123,
  guid: '123',
  guidHash: '123',
  url: 'https://example.com/article',
  title: 'Article',
  author: null,
  pubDate: null,
  updatedDate: null,
  body: 'Original body',
  enclosureMime: null,
  enclosureLink: null,
  mediaThumbnail: null,
  mediaDescription: null,
  feedId: feed.id,
  unread: true,
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
let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('location', new URL('https://reader.example/reader/'))
  await dbClear()
  await dbPutFeed(feed)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('legacy feature callers', () => {
  it.each([settings.baseUrl, 'https://reader.example/nextcloud'])(
    'keeps full sync nonfatal for unsupported legacy hydration at %s',
    async (baseUrl) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const path = new URL(String(input)).pathname
        if (path.endsWith('/api/v1-3/feeds')) {
          return new Response(JSON.stringify({ feeds: [feed] }))
        }
        if (path.endsWith('/api/v1-3/folders')) {
          return new Response('{"folders":[]}')
        }
        if (path.endsWith('/api/v1-3/items')) {
          return new Response('{"items":[]}')
        }
        throw new Error(`Unexpected request: ${input}`)
      })
      vi.stubGlobal('fetch', fetchMock)

      await fullSync({ ...settings, baseUrl })

      expect(await isInitialized()).toBe(true)
      expect(getStatus().stage).toBe('done')
      expect(warn).toHaveBeenCalledWith('feed settings read failed', expect.any(Error))
      expect(warn.mock.calls[0][1].message).toContain('unsupported')
      expect(fetchMock).toHaveBeenCalledTimes(4)
      for (const [url] of fetchMock.mock.calls) {
        expect(String(url)).toMatch(`${baseUrl}/apps/news/api/v1-3/`)
      }
    },
  )

  it('hydrates full-text flags with an explicit same-origin root base URL', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url === '/apps/news/feeds') {
        return new Response('{"feeds":[{"id":456,"fullTextEnabled":true}]}')
      }
      if (url.endsWith('/feeds')) return new Response(JSON.stringify({ feeds: [feed] }))
      if (url.endsWith('/folders')) return new Response('{"folders":[]}')
      return new Response('{"items":[]}')
    })
    vi.stubGlobal('fetch', fetchMock)

    await fullSync({ ...settings, baseUrl: 'https://reader.example/' })

    expect((await dbGetFeed(feed.id))?.fullTextEnabled).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => url === '/apps/news/feeds')).toBe(true)
  })

  it('shows the unsupported feed-setting error and rolls back the toggle', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const onChanged = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => {
      root.render(
        <FeedSettingsModal
          feed={feed}
          settings={settings}
          onClose={vi.fn()}
          onChanged={onChanged}
        />,
      )
    })
    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!

    await act(async () => {
      checkbox.click()
    })
    await vi.waitFor(() =>
      expect(document.querySelector('.error')?.textContent).toContain('unsupported'),
    )

    expect(checkbox.checked).toBe(false)
    expect((await dbGetFeed(feed.id))?.fullTextEnabled).toBe(false)
    expect(onChanged).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the extraction error propagated by the real action without a request', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    await act(async () => {
      root.render(
        <ItemView
          item={item}
          feedTitle={() => feed.title}
          actions={{
            extractFulltext: (target) => extractFulltext(settings, target),
            setRead: vi.fn(),
            setStar: vi.fn(),
            ensureFeed: vi.fn(),
            ensureUnread: vi.fn(),
            refreshMeta: vi.fn(),
            syncNow: vi.fn(),
            clearError: vi.fn(),
            reset: vi.fn(),
          }}
          articleCssMode="default"
          articleCss=""
          dimBoilerplate={false}
          recentBodies={[]}
          autoExtract={false}
          onFeedClick={vi.fn()}
        />,
      )
    })

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title^="Extract full article"]')!.click()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('unsupported')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
