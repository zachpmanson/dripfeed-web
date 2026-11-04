// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import type { AppData } from './hooks'
import type { NewsFeed, NewsItem } from './api/types'
import { NEWSPAPER_QUERY } from './hooks/usePresentation'

const mocks = vi.hoisted(() => ({ store: null as AppData | null }))
vi.mock('./hooks', () => ({ useStore: () => mocks.store! }))
vi.mock('./components/feed/Sidebar', () => ({ Sidebar: () => null }))
vi.mock('./settings', () => ({
  loadSettings: () => ({ user: 'fixture', appPassword: 'fixture', baseUrl: '' }),
}))
vi.mock('./hooks/useThemePreferences', () => ({
  default: () => ({
    articleCssMode: 'default',
    articleCss: '',
    singleClickRead: localStorage.getItem('single') === '1',
  }),
}))

let root: Root, container: HTMLDivElement
let desktop: boolean
let resize: () => void
let observe: IntersectionObserverCallback
let disconnected: ReturnType<typeof vi.fn>
const item = (id: number): NewsItem =>
  ({
    id,
    feedId: 1,
    title: `Story ${id}`,
    url: `https://fixture.invalid/${id}`,
    body: '<p>Safe excerpt</p>',
    intro: null,
    unread: true,
    starred: false,
    pubDate: id * 1000,
    rtl: false,
  }) as NewsItem
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  localStorage.setItem('dripfeed.showMode', 'all')
  localStorage.setItem('dripfeed.sort', 'newest')
  window.history.replaceState(null, '', '/?view=all')
  desktop = true
  resize = () => {}
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => {
      expect(query).toBe(NEWSPAPER_QUERY)
      return {
        get matches() {
          return desktop
        },
        addEventListener: (_: string, cb: () => void) => {
          resize = cb
        },
        removeEventListener: vi.fn(),
      }
    }),
  )
  disconnected = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        observe = cb
      }
      observe() {}
      disconnect = disconnected
    },
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  mocks.store = {
    ready: true,
    pool: Array.from({ length: 120 }, (_, i) => item(i + 1)),
    feeds: new Map([[1, { id: 1, title: 'Feed', fullTextEnabled: false } as NewsFeed]]),
    folders: [],
    cursors: new Map([[1, 1]]),
    unreadDrained: new Set(),
    unreadProbing: false,
    loadMore: vi.fn(),
    actions: {
      setRead: vi.fn(async () => {}),
      setStar: vi.fn(async () => {}),
      extractFulltext: vi.fn(async () => {}),
      clearError: vi.fn(),
    },
  } as unknown as AppData
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
const render = async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
}
const click = async (selector: string) => {
  const button = container.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  await act(async () => button!.click())
}
const selectNewspaper = async () => {
  const button = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
    (b) => b.textContent === 'Newspaper',
  )!
  await act(async () => button.click())
}
const newspaper = () => container.querySelector<HTMLUListElement>('.newspaper')!

it('defaults to the unchanged list; stores a mode choice and retains it across narrow fallback', async () => {
  await render()
  expect(container.querySelector('.item-list')).not.toBeNull()
  await selectNewspaper()
  expect(newspaper()).not.toBeNull()
  expect(localStorage.getItem('dripfeed.presentation')).toBe('newspaper')
  await act(async () => {
    desktop = false
    resize()
  })
  expect(container.querySelector('.item-list')).not.toBeNull()
  expect(container.querySelector('[aria-label="Presentation"]')).toBeNull()
  expect(localStorage.getItem('dripfeed.presentation')).toBe('newspaper')
  await act(async () => {
    desktop = true
    resize()
  })
  expect(newspaper()).not.toBeNull()
})

it('requires explicit URL selection to mount/extract; returns scroll, render window and focus without hidden paging', async () => {
  localStorage.setItem('dripfeed.presentation', 'newspaper')
  mocks.store!.feeds.get(1)!.fullTextEnabled = true
  await render()
  expect(container.querySelector('iframe')).toBeNull()
  expect(mocks.store!.actions.extractFulltext).not.toHaveBeenCalled()
  expect(mocks.store!.actions.setRead).not.toHaveBeenCalled()
  expect(newspaper().querySelectorAll('[data-story-id]')).toHaveLength(50)
  await act(async () =>
    observe([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver),
  )
  expect(newspaper().querySelectorAll('[data-story-id]')).toHaveLength(100)
  newspaper().scrollTop = 900
  await click('[data-story-id="120"]')
  expect(location.search).toContain('item=120')
  expect(container.querySelector('iframe')).not.toBeNull()
  expect(mocks.store!.actions.extractFulltext).toHaveBeenCalledTimes(1)
  expect(document.activeElement?.textContent).toContain('Back to front page')
  expect(newspaper().parentElement?.className).toBe('hidden')
  const count = newspaper().querySelectorAll('[data-story-id]').length
  // Even a queued observer delivery after disconnect must stay quiet.
  await act(async () =>
    observe([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver),
  )
  expect(newspaper().querySelectorAll('[data-story-id]')).toHaveLength(count)
  expect(mocks.store!.loadMore).not.toHaveBeenCalled()
  expect(disconnected).toHaveBeenCalled()
  const back = [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes('Back to front page'),
  )!
  await act(async () => back.click())
  expect(newspaper().scrollTop).toBe(900)
  expect(document.activeElement?.getAttribute('data-story-id')).toBe('120')
  expect(newspaper().querySelectorAll('[data-story-id]')).toHaveLength(100)
  expect(container.querySelector('iframe')).toBeNull()
  expect(mocks.store!.actions.setRead).not.toHaveBeenCalled()
})

it('wires read/star to existing actions, single-click-read once and retains a filtered reader selection', async () => {
  localStorage.setItem('dripfeed.presentation', 'newspaper')
  localStorage.setItem('single', '1')
  window.history.replaceState(null, '', '/?view=allUnread')
  localStorage.setItem('dripfeed.showMode', 'unread')
  await render()
  await click('[aria-label="Star: Story 120"]')
  expect(mocks.store!.actions.setStar).toHaveBeenCalledWith(mocks.store!.pool[119], true)
  await click('[aria-label="Mark read: Story 120"]')
  expect(mocks.store!.actions.setRead).toHaveBeenCalledWith(mocks.store!.pool[119], false)
  vi.mocked(mocks.store!.actions.setRead).mockClear()
  await click('[data-story-id="120"]')
  expect(mocks.store!.actions.setRead).toHaveBeenCalledTimes(1)
  mocks.store!.pool[119] = { ...mocks.store!.pool[119], unread: false }
  await render()
  expect(newspaper().querySelector('[data-story-id="120"]')).toBeNull()
  expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toContain('Safe excerpt')
})

it.each([
  ['read', 3],
  ['read', 1],
  ['read', 0],
  ['star', 3],
  ['star', 1],
  ['star', 0],
] as const)(
  'recovers focused %s removal to a surviving story (remaining: %s), or the labelled empty list',
  async (action, remaining) => {
    localStorage.setItem('dripfeed.presentation', 'newspaper')
    window.history.replaceState(null, '', `/?view=${action === 'read' ? 'allUnread' : 'starred'}`)
    mocks.store!.pool = Array.from({ length: remaining + 1 }, (_, i) => ({
      ...item(i + 1),
      starred: true,
    }))
    await render()
    const id = remaining === 3 ? 3 : 1
    const label = action === 'read' ? 'Mark read' : 'Unstar'
    const button = newspaper().querySelector<HTMLButtonElement>(
      `[aria-label="${label}: Story ${id}"]`,
    )!
    await act(async () => button.focus())
    await act(async () => button.click())
    mocks.store!.pool = mocks.store!.pool.map((story) =>
      story.id === id
        ? { ...story, ...(action === 'read' ? { unread: false } : { starred: false }) }
        : story,
    )
    await render()
    expect(button.isConnected).toBe(false)
    expect(newspaper().querySelectorAll('[data-story-id]')).toHaveLength(remaining)
    if (remaining) {
      expect(document.activeElement?.getAttribute('data-story-id')).toBe('2')
    } else {
      expect(document.activeElement).toBe(newspaper())
      expect(newspaper().getAttribute('aria-label')).toBe('Newspaper stories')
    }
    expect(container.querySelector('iframe')).toBeNull()
  },
)

it('does not reclaim focus after navigation or focus moving to app chrome or a modal', async () => {
  localStorage.setItem('dripfeed.presentation', 'newspaper')
  window.history.replaceState(null, '', '/?view=allUnread')
  mocks.store!.pool = [item(1), item(2)]
  await render()
  const readButton = () =>
    newspaper().querySelector<HTMLButtonElement>('[aria-label^="Mark read"]')!
  await act(async () => readButton().focus())
  const settings = container.querySelector<HTMLButtonElement>('[aria-label="Settings"]')!
  await act(async () => settings.focus())
  mocks.store!.pool = [item(1)]
  await render()
  expect(document.activeElement).toBe(settings)

  await act(async () => readButton().focus())
  await act(async () => settings.click())
  // This suite stubs rAF to keep list paging inert; focus the actual modal
  // control explicitly rather than relying on the library's scheduled autofocus.
  const modalFocus = document.querySelector<HTMLButtonElement>(
    '[role="dialog"] [aria-label="close"]',
  )!
  expect(modalFocus).not.toBeNull()
  await act(async () => modalFocus.focus())
  mocks.store!.pool = []
  await render()
  expect(document.activeElement).toBe(modalFocus)
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="close"]')!.click())

  mocks.store!.pool = [item(1), item(2)]
  await render()
  await act(async () => readButton().focus())
  await act(async () => {
    history.replaceState(null, '', '/?view=starred')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(document.activeElement).not.toBe(newspaper())
  expect(document.activeElement?.hasAttribute('data-story-id')).toBe(false)
})

it('honors deep links/popstate and never opens a fallback for an unavailable explicit newspaper item', async () => {
  localStorage.setItem('dripfeed.presentation', 'newspaper')
  window.history.replaceState(null, '', '/?view=all&item=25')
  await render()
  expect(container.querySelector('iframe')).not.toBeNull()
  await act(async () => {
    history.replaceState(null, '', '/?view=all')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(container.querySelector('iframe')).toBeNull()
  await act(async () => {
    history.replaceState(null, '', '/?view=all&item=99999')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(container.querySelector('iframe')).toBeNull()
  expect(newspaper().parentElement?.className).not.toBe('hidden')
})

it('uses invalid preferences as list and tolerates storage that throws', async () => {
  localStorage.setItem('dripfeed.presentation', 'unexpected')
  await render()
  expect(container.querySelector('.item-list')).not.toBeNull()
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  await selectNewspaper()
  expect(newspaper()).not.toBeNull()
  storage.mockRestore()
})
