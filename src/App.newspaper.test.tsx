// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import type { AppData } from './hooks'
import type { NewsFeed, NewsItem } from './api/types'

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
let resize: ResizeObserverCallback
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
  disconnected = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect = disconnected
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resize = cb
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
const newspaper = () => container.querySelector<HTMLUListElement>('.newspaper-chunks')!
const newspaperScroll = () => container.querySelector<HTMLDivElement>('.newspaper-scroll')!

it.each([360, 768, 1100, 1600])(
  'shows both mode controls at %spx and keeps the selected mode through resize',
  async (width) => {
    vi.stubGlobal('innerWidth', width)
    vi.stubGlobal('matchMedia', undefined)
    await render()
    expect(container.querySelector('.item-list')).not.toBeNull()
    expect(container.querySelector('[aria-label="Presentation"]')).not.toBeNull()
    await selectNewspaper()
    expect(newspaper()).not.toBeNull()
    expect(localStorage.getItem('dripfeed.presentation')).toBe('newspaper')
    await act(async () => {
      vi.stubGlobal('innerWidth', width < 1100 ? 1600 : 360)
      window.dispatchEvent(new Event('resize'))
    })
    expect(newspaper()).not.toBeNull()
    expect(container.querySelector('[aria-label="Presentation"]')).not.toBeNull()
    expect(localStorage.getItem('dripfeed.presentation')).toBe('newspaper')
    const list = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (button) => button.textContent === 'List',
    )!
    await act(async () => list.click())
    expect(container.querySelector('.item-list')).not.toBeNull()
    expect(container.querySelector('[aria-label="Back"]')).toBeNull()
    expect(localStorage.getItem('dripfeed.presentation')).toBe('list')
  },
)

it('loads the saved newspaper mode on a narrow window and preserves the open reader on resize', async () => {
  vi.stubGlobal('innerWidth', 360)
  localStorage.setItem('dripfeed.presentation', 'newspaper')
  await render()
  expect(newspaper()).not.toBeNull()
  await click('[data-story-id="120"]')
  const frame = container.querySelector('iframe')
  expect(frame).not.toBeNull()
  const route = location.search
  await act(async () => {
    vi.stubGlobal('innerWidth', 1600)
    window.dispatchEvent(new Event('resize'))
  })
  expect(container.querySelector('iframe')).toBe(frame)
  expect(location.search).toBe(route)
  expect(localStorage.getItem('dripfeed.presentation')).toBe('newspaper')
})

it('requires explicit URL selection to mount/extract; returns scroll, chunks and focus without hidden paging', async () => {
  localStorage.setItem('dripfeed.presentation', 'newspaper')
  mocks.store!.feeds.get(1)!.fullTextEnabled = true
  await render()
  expect(container.querySelector('iframe')).toBeNull()
  expect(mocks.store!.actions.extractFulltext).not.toHaveBeenCalled()
  expect(mocks.store!.actions.setRead).not.toHaveBeenCalled()
  const storyIds = () =>
    [...newspaper().querySelectorAll('[data-story-id]')].map((node) =>
      Number(node.getAttribute('data-story-id')),
    )
  expect(storyIds().sort((a, b) => b - a)).toEqual(Array.from({ length: 100 }, (_, i) => 120 - i))
  expect(newspaper().querySelectorAll('.newspaper')).toHaveLength(2)
  expect(newspaper().querySelectorAll('.newspaper-lead')).toHaveLength(1)
  expect(newspaper().parentElement).toBe(newspaperScroll())
  expect(newspaperScroll().classList.contains('overflow-y-auto')).toBe(true)
  expect(newspaperScroll().classList.contains('min-h-0')).toBe(true)
  expect(newspaper().classList.contains('overflow-y-auto')).toBe(false)
  expect(newspaper().classList.contains('flex-1')).toBe(false)
  expect(newspaper().classList.contains('grid')).toBe(false)
  expect(newspaper().querySelectorAll('.col-span-full')).toHaveLength(1)
  expect(newspaper().querySelectorAll('.newspaper-column')).toHaveLength(6)
  expect(storyIds().slice(0, 4)).toEqual([120, 119, 116, 113])
  expect([...newspaper().children].every((node) => !(node as HTMLElement).style.gridRowEnd)).toBe(
    true,
  )
  expect(
    newspaper()
      .querySelector('[data-story-id="120"]')
      ?.closest('ul')
      ?.classList.contains('col-span-full'),
  ).toBe(true)
  expect(
    newspaper()
      .querySelector('[data-story-id="116"]')
      ?.closest('li')
      ?.classList.contains('newspaper-feature'),
  ).toBe(true)
  await act(async () => resize([], {} as ResizeObserver))
  expect(storyIds().sort((a, b) => b - a)).toEqual(Array.from({ length: 100 }, (_, i) => 120 - i))
  expect(newspaper().querySelectorAll('.newspaper-lead')).toHaveLength(1)
  newspaperScroll().scrollTop = 900
  await click('[data-story-id="120"]')
  expect(location.search).toContain('item=120')
  expect(container.querySelector('iframe')).not.toBeNull()
  expect(mocks.store!.actions.extractFulltext).toHaveBeenCalledTimes(1)
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Back')
  expect(newspaperScroll().parentElement?.className).toBe('hidden')
  const count = newspaper().querySelectorAll('[data-story-id]').length
  // Even a queued resize delivery after disconnect must stay quiet.
  await act(async () => resize([], {} as ResizeObserver))
  expect(newspaper().querySelectorAll('[data-story-id]')).toHaveLength(count)
  expect(mocks.store!.loadMore).not.toHaveBeenCalled()
  expect(disconnected).toHaveBeenCalled()
  const back = container.querySelector<HTMLButtonElement>('[aria-label="Back"]')!
  expect(back.textContent).toBe('')
  expect(back.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  expect(back.classList.contains('size-8')).toBe(true)
  expect(back.type).toBe('button')
  // Shared title/header wrapper wiring, not a pixel-alignment assertion.
  const titleLine = back.parentElement!
  expect(titleLine.classList.contains('flex')).toBe(true)
  expect(titleLine.classList.contains('min-w-0')).toBe(true)
  expect(titleLine.querySelector('h2')?.textContent).toBe('Story 120')
  const header = titleLine.parentElement!
  expect(header.querySelector('[aria-label="Star"]')).not.toBeNull()
  expect(header.querySelector('[aria-label^="Extract full article"]')).not.toBeNull()
  expect(header.querySelector('[aria-label="Mark read"]')).not.toBeNull()
  expect(header.parentElement?.tagName).toBe('ARTICLE')
  expect(header.parentElement?.firstElementChild).toBe(header)
  await act(async () => back.click())
  expect(newspaperScroll().scrollTop).toBe(900)
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
  expect(newspaperScroll().parentElement?.className).not.toBe('hidden')
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
