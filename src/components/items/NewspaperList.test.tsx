// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NewsItem, NewsFeed } from '../../api/types'
import { ItemList, type ItemListProps } from './ItemList'
import { newspaperRole } from './newspaperPresentation'
import {
  estimatedStoryHeight,
  newspaperColumnWidth,
  newspaperColumnCount,
  NEWSPAPER_MAX_MOUNTED,
} from './newspaperVirtualization'

const item = (id: number): NewsItem =>
  ({
    id,
    feedId: 1,
    title: `Story ${id}`,
    url: `https://fixture.invalid/${id}`,
    body: '<p>Preview</p>',
    intro: null,
    unread: true,
    starred: false,
    pubDate: 0,
    rtl: false,
  }) as NewsItem
const pool = Array.from({ length: 10_000 }, (_, index) => item(index + 1))
let root: Root
let host: HTMLDivElement
let props: ItemListProps
let frames: Map<number, FrameRequestCallback>
let allFrames: FrameRequestCallback[]
let nextFrame: number
let width: number
let height: number
let storyHeights: Map<number, number>
let observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[]
let intersection: IntersectionObserverCallback
let storyIds: WeakMap<HTMLElement, number>

const pane = () => host.querySelector<HTMLDivElement>('.newspaper-scroll')!
const list = () => host.querySelector<HTMLUListElement>('.newspaper-chunks')!
const stories = () => [...host.querySelectorAll<HTMLButtonElement>('[data-story-id]')]
const ids = () => stories().map((story) => Number(story.dataset.storyId))
const columns = () => [...host.querySelectorAll<HTMLUListElement>('.newspaper-column')]
const nativeHeight = (node: HTMLElement) => {
  let id = storyIds.get(node)
  if (id === undefined) {
    id = Number(node.querySelector<HTMLElement>('[data-story-id]')!.dataset.storyId)
    storyIds.set(node, id)
  }
  const lead = node.classList.contains('newspaper-lead')
  const storyWidth = lead
    ? width - 80
    : newspaperColumnWidth(width - 80, node.parentElement!.parentElement!.children.length)
  return storyHeights.get(id) ?? estimatedStoryHeight(storyWidth, lead)
}
const partHeight = (node: Element) => {
  const element = node as HTMLElement
  return element.classList.contains('newspaper-story')
    ? nativeHeight(element)
    : Number.parseFloat(element.style.height) || 0
}
const leadHeight = () => {
  const lead = host.querySelector<HTMLElement>('.newspaper-lead')
  return lead
    ? nativeHeight(lead)
    : Number.parseFloat(
        host.querySelector<HTMLElement>('[data-newspaper-lead-placeholder]')?.style.height ?? '',
      ) || 0
}
const columnHeight = (node: Element) =>
  [...node.children].reduce((sum, child) => sum + partHeight(child), 0)
// Absolute-rank estimated destination, not a cross-column section boundary.
const offset = (oldPage: number) => {
  if (oldPage === 0) return 28
  const columnWidth = newspaperColumnWidth(width - 80, newspaperColumnCount(width - 80))
  return (
    28 +
    estimatedStoryHeight(width - 80, true) +
    Math.floor((oldPage * 50 - 1) / newspaperColumnCount(width - 80)) *
      estimatedStoryHeight(columnWidth)
  )
}
const bounds = () => {
  expect(stories().length).toBeLessThanOrEqual(NEWSPAPER_MAX_MOUNTED)
  expect(host.querySelectorAll('.newspaper-lead').length).toBeLessThanOrEqual(1)
  expect(new Set(ids()).size).toBe(ids().length)
  expect(columns()).toHaveLength(newspaperColumnCount(width - 80))
  for (const column of columns()) {
    const ranked = [...column.querySelectorAll<HTMLElement>('[data-story-id]')].map((node) =>
      Number(node.dataset.storyId),
    )
    expect(ranked).toEqual([...ranked].sort((a, b) => a - b))
    if (props.items === pool)
      ranked.forEach((id) => expect((id - 2) % columns().length).toBe(columns().indexOf(column)))
    for (const spacer of column.querySelectorAll<HTMLElement>('[data-newspaper-spacer]')) {
      expect(Number.parseFloat(spacer.style.height)).toBeGreaterThanOrEqual(0)
    }
  }
}
const flush = async () => {
  for (let batch = 0; frames.size && batch < 30; batch++) {
    const callbacks = [...frames.values()]
    frames.clear()
    await act(async () => {
      callbacks.forEach((callback) => callback(batch * 16))
    })
  }
  expect(frames.size, 'rAF work must settle').toBe(0)
}
const render = async (next: Partial<ItemListProps> = {}, runFrames = true) => {
  props = { ...props, ...next }
  await act(async () =>
    root.render(
      <StrictMode>
        <ItemList {...props} />
      </StrictMode>,
    ),
  )
  if (runFrames) await flush()
}
const scroll = async (top: number) => {
  await act(async () => {
    pane().scrollTop = top
    pane().dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await flush()
}
// Full-range regression cases explicitly expose the cached range by selecting
// its last chunk; ordinary front-page tests retain progressive exposure.
const exposeAll = async (next: Partial<ItemListProps> = {}) => {
  await render({ ...next, selectedId: 10_000 })
  await render({ selectedId: null })
}
const represented = () =>
  Math.ceil(
    Number(host.querySelector<HTMLElement>('[data-newspaper-count]')!.dataset.newspaperCount) / 50,
  )
const loadMore = () =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Load more',
  )!
const resize = async () => {
  await act(async () => {
    observers.at(-1)!.callback([], {} as ResizeObserver)
  })
  await flush()
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  width = 980
  height = 600
  frames = new Map()
  allFrames = []
  nextFrame = 1
  storyHeights = new Map()
  storyIds = new WeakMap()
  observers = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    allFrames.push(callback)
    const id = nextFrame++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = vi.fn()
      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, disconnect: this.disconnect })
      }
      observe() {}
    },
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersection = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  // Executable per-column geometry, NOT native layout/performance evidence.
  const computed = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((node) => {
    return node.classList.contains('newspaper-story')
      ? ({ marginBottom: '24px' } as CSSStyleDeclaration)
      : computed(node)
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('newspaper-scroll') ? width : width - 80
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('newspaper-scroll') ? height : 0
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.classList.contains('newspaper-scroll')
      ? 96 + leadHeight() + Math.max(0, ...columns().map(columnHeight))
      : 1000
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    let top = this.classList.contains('newspaper-chunks') ? 128 - pane().scrollTop : 100
    let h = height
    let left = 0
    let w = width - 80
    const story = this.closest<HTMLElement>('.newspaper-story')
    if (story) {
      const lead = story.classList.contains('newspaper-lead')
      const preceding = [...story.parentElement!.children].slice(
        0,
        [...story.parentElement!.children].indexOf(story),
      )
      top =
        128 -
        pane().scrollTop +
        (lead ? 0 : leadHeight()) +
        preceding.reduce((sum, node) => sum + partHeight(node), 0)
      h = nativeHeight(story) - 24
      w = lead
        ? width - 80
        : newspaperColumnWidth(width - 80, story.parentElement!.parentElement!.children.length)
      left = lead
        ? 0
        : [...story.parentElement!.parentElement!.children].indexOf(story.parentElement!) * (w + 28)
      if (this.hasAttribute('data-story-id')) {
        top += 30
        h = 50
      }
    }
    return {
      x: left,
      y: top,
      top,
      left,
      right: left + w,
      bottom: top + h,
      width: w,
      height: h,
      toJSON() {},
    }
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  props = {
    newspaper: true,
    items: pool,
    selectedId: null,
    windowKey: 'all',
    active: true,
    feedTitle: () => 'Fixture',
    onSelect: vi.fn(),
    onRead: vi.fn(),
    onStar: vi.fn(),
    moreServer: false,
    drained: true,
    onLoadMore: vi.fn(),
  }
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('bounds 10,000 stories with independent ranked windows and absolute accessible positions', async () => {
  await render()
  bounds()
  expect(represented()).toBe(2)
  expect(stories().length).toBeLessThan(100)
  expect(pane().scrollHeight).toBeLessThan(20_000)
  expect(list().textContent).not.toContain('up to date')
  await exposeAll()
  for (const page of [1, 80, 199, 100, 3, 197, 0]) {
    await scroll(offset(page) + 100)
    bounds()
    const target = page * 50 + 1
    const story = host.querySelector(`[data-story-id="${target}"]`)!
    expect(story).not.toBeNull()
    expect(story.closest('li')?.getAttribute('aria-posinset')).toBe(String(target))
    expect(story.closest('li')?.getAttribute('aria-setsize')).toBe('10000')
    if (page > 1) expect(host.querySelector('.newspaper-lead')).toBeNull()
  }
  expect(props.onLoadMore).not.toHaveBeenCalled()
}, 20_000)

it('reveals one local chunk two viewports early, never drains on idle and pauses while hidden', async () => {
  height = 800
  await render({ moreServer: true, drained: false })
  expect(represented()).toBe(2)
  await scroll(pane().scrollHeight - height - 1700)
  expect(represented()).toBe(2)
  await scroll(pane().scrollHeight - height - 1500)
  expect(represented()).toBe(3)
  bounds()
  for (let count = 0; count < 4; count++) await resize()
  expect(represented()).toBe(3)
  expect(props.onLoadMore).not.toHaveBeenCalled()
  await scroll(pane().scrollHeight - height - 1500)
  expect(represented()).toBe(4)
  bounds()
  await render({ active: false })
  await scroll(pane().scrollHeight - height)
  await resize()
  expect(represented()).toBe(4)
  expect(props.onLoadMore).not.toHaveBeenCalled()
})

it('does not expose a huge viewport on idle or repeatedly drain a short exposed tail', async () => {
  height = 10_000_000
  await render({ moreServer: true, drained: false })
  for (let count = 0; count < 3; count++) await resize()
  expect(represented()).toBe(2)
  await scroll(1)
  expect(represented()).toBe(3)
  for (let count = 0; count < 3; count++) await resize()
  await scroll(2)
  expect(represented()).toBe(3)
  expect(props.onLoadMore).not.toHaveBeenCalled()
  bounds()
}, 30_000)

it('makes the button local-first and never reports up to date while cached stories are hidden', async () => {
  await render({ items: pool.slice(0, 175), moreServer: false, drained: true })
  expect(represented()).toBe(2)
  expect(list().textContent).not.toContain('up to date')
  await act(async () => loadMore().click())
  await flush()
  expect(represented()).toBe(3)
  expect(list().textContent).not.toContain('up to date')
  await act(async () => loadMore().click())
  await flush()
  expect(represented()).toBe(4)
  expect(list().textContent).toContain('up to date')
  expect(props.onLoadMore).not.toHaveBeenCalled()
  await render({ moreServer: true, drained: false })
  await act(async () => loadMore().click())
  await flush()
  expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  bounds()
})

it('expands a hidden URL target without mounting its prefix and resets exposure only on window remount', async () => {
  await render()
  await render({ active: false, selectedId: 9950 })
  expect(represented()).toBe(199)
  expect(host.querySelector('[data-story-id="9950"]')).not.toBeNull()
  expect(host.querySelector('[data-story-id="1"]')).toBeNull()
  bounds()
  await render({ active: true, selectedId: null })
  expect(document.activeElement?.getAttribute('data-story-id')).toBe('9950')
  await scroll(0)
  expect(represented()).toBe(199)
  await render({ windowKey: 'new-scope' })
  expect(represented()).toBe(2)
  bounds()
})

it('redistributes ranked tops into three, two and one stacks on resize without changing rank or roles', async () => {
  await render()
  const first = () => host.querySelector<HTMLElement>('.newspaper')!
  expect(
    [...first().querySelectorAll('.newspaper-column')].map((column) =>
      column.querySelector('[data-story-id]')?.getAttribute('data-story-id'),
    ),
  ).toEqual(['2', '3', '4'])
  expect(ids().slice(0, 4)).toEqual([1, 2, 5, 8])
  await act(async () => host.querySelector<HTMLButtonElement>('[data-story-id="3"]')!.focus())
  for (const nextWidth of [680, 440, 980]) {
    width = nextWidth
    await resize()
    bounds()
    expect(document.activeElement?.getAttribute('data-story-id')).toBe('3')
    expect(ids()).toContain(3)
    const count = newspaperColumnCount(width - 80)
    const extent = estimatedStoryHeight(newspaperColumnWidth(width - 80, count))
    for (let column = 0; column < count; column++) {
      for (let row = 0; 2 + column + row * count <= 100; row++) {
        const top = 128 - pane().scrollTop + leadHeight() + row * extent
        if (top + extent > 100 && top < 100 + height) {
          expect(ids()).toContain(2 + column + row * count)
        }
      }
    }
    expect(first().style.gridTemplateColumns).toBe(
      `repeat(${newspaperColumnCount(width - 80)}, minmax(0, 1fr))`,
    )
    expect(
      host.querySelector('.newspaper-lead [data-story-id]')?.getAttribute('data-story-id'),
    ).toBe('1')
    expect(
      host
        .querySelector('[data-story-id="5"]')
        ?.closest('li')
        ?.classList.contains('newspaper-feature'),
    ).toBe(true)
  }
})

it('overscans each column ahead of the shared viewport without mounting the prefix', async () => {
  await exposeAll()
  await scroll(offset(100) + 200)
  for (const column of columns()) {
    const headlines = [...column.querySelectorAll<HTMLElement>('[data-story-id]')]
    expect(headlines.at(-1)!.getBoundingClientRect().top).toBeGreaterThan(100 + height)
    expect(
      Number.parseFloat(
        column.querySelector<HTMLElement>('[data-newspaper-spacer="top"]')!.style.height,
      ),
    ).toBeGreaterThan(0)
  }
  bounds()
})

it('reveals cached stories at a short column tail without waiting for the longest column or draining automatically', async () => {
  const items = pool.slice(0, 400)
  items.forEach((story, index) =>
    storyHeights.set(story.id, index === 0 ? 300 : [180, 470, 900][(index - 1) % 3]),
  )
  await render({ items, moreServer: true, drained: false })
  expect(represented()).toBe(2)
  for (let top = 500; top <= 6500 && represented() === 2; top += 500) await scroll(top)
  expect(represented()).toBe(3)
  expect(pane().scrollHeight - pane().scrollTop - height).toBeGreaterThan(1200)
  expect(props.onLoadMore).not.toHaveBeenCalled()
  for (let repeat = 0; repeat < 3; repeat++) await resize()
  expect(represented()).toBe(3)
  bounds()
})

it('prefetches the server two viewports early, without serially draining small pages inside that margin', async () => {
  height = 800
  await exposeAll({ moreServer: true, drained: false })
  await scroll(pane().scrollHeight - height - 1700)
  expect(props.onLoadMore).not.toHaveBeenCalled()
  await scroll(pane().scrollHeight - height - 1500)
  expect(pane().scrollHeight - pane().scrollTop - height).toBeCloseTo(1500)
  expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  // A small/filtered result still inside the margin must not schedule page 2.
  await render({ items: [...pool, item(10_001)] })
  for (let count = 0; count < 3; count++) await resize()
  expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  bounds()
})

it('caps even a viewport taller than the entire estimated pool and coalesces rapid jumps', async () => {
  height = 10_000_000
  await exposeAll()
  bounds()
  expect(stories().length).toBeLessThanOrEqual(250)
  await act(async () => {
    for (const chunk of [150, 2, 199, 70]) {
      pane().scrollTop = offset(chunk) + 100
      pane().dispatchEvent(new Event('scroll', { bubbles: true }))
    }
  })
  await flush()
  bounds()
  expect(host.querySelector('[data-story-id="3501"]')).not.toBeNull()
}, 30_000)

it('anchors an actual visible headline through image/font height changes, width changes and removal', async () => {
  await exposeAll()
  await scroll(offset(100) + 200)
  const visible = stories().find(
    (node) => node.getBoundingClientRect().top >= 100 && node.getBoundingClientRect().top < 700,
  )!
  const id = Number(visible.dataset.storyId)
  const beforeTop = visible.getBoundingClientRect().top
  const previous = visible.closest('li')!.previousElementSibling as HTMLElement
  const previousId = Number(previous.querySelector<HTMLElement>('[data-story-id]')!.dataset.storyId)
  const before = pane().scrollTop
  storyHeights.set(previousId, nativeHeight(previous) + 500)
  await resize()
  expect(pane().scrollTop).toBeCloseTo(before + 500)
  expect(
    host.querySelector<HTMLElement>(`[data-story-id="${id}"]`)!.getBoundingClientRect().top,
  ).toBeCloseTo(beforeTop)
  // Height anchoring can change which column owns the topmost visible
  // headline. Resize must preserve that current anchor, not every visible ID.
  const resizeAnchor = stories()
    .map((node) => ({ id: node.dataset.storyId!, rect: node.getBoundingClientRect() }))
    .filter(({ rect }) => rect.bottom > 100 && rect.top < 100 + height)
    .sort((a, b) => a.rect.top - b.rect.top)[0]
  width = 440
  await resize()
  expect(host.querySelector(`[data-story-id="${id}"]`)).not.toBeNull()
  expect(
    host.querySelector<HTMLElement>(`[data-story-id="${resizeAnchor.id}"]`)!.getBoundingClientRect()
      .top,
  ).toBeCloseTo(resizeAnchor.rect.top)
  expect(pane().scrollTop).toBeGreaterThan(100_000)
  await render({ items: pool.slice(1) })
  expect(host.querySelector(`[data-story-id="${id}"]`)).not.toBeNull()
  bounds()
})

it('reuses per-story measured heights after eviction instead of retaining story DOM', async () => {
  storyHeights.set(5001, 2400)
  await exposeAll()
  await scroll(offset(100) + 100)
  const column = host.querySelector('[data-story-id="5001"]')!.closest('.newspaper-column')!
  const measuredTotal = columnHeight(column)
  bounds()
  await scroll(offset(10))
  expect(host.querySelector('[data-story-id="5001"]')).toBeNull()
  expect(columnHeight(columns()[1])).toBeCloseTo(measuredTotal)
  await scroll(offset(100) + 100)
  expect(host.querySelector('[data-story-id="5001"]')).not.toBeNull()
  bounds()
})

it('keeps hidden/deep-link selections bounded and restores their chunk and headline on Back', async () => {
  await render({ active: false, selectedId: 9950 })
  bounds()
  expect(stories().length).toBeLessThanOrEqual(250)
  expect(host.querySelector('[data-story-id="9950"]')).not.toBeNull()
  expect(host.querySelector('[data-story-id="1"]')).toBeNull()
  expect(props.onLoadMore).not.toHaveBeenCalled()
  // The hidden pane was not observed while a narrow layout replaced the wide one.
  width = 440
  await render({ active: true, selectedId: null })
  expect(document.activeElement?.getAttribute('data-story-id')).toBe('9950')
  const selectedRect = document.activeElement!.getBoundingClientRect()
  expect(selectedRect.top).toBeGreaterThanOrEqual(pane().getBoundingClientRect().top)
  expect(selectedRect.top).toBeLessThan(pane().getBoundingClientRect().bottom)
  expect(pane().scrollTop).toBeGreaterThan(1_000_000)
  bounds()
  // A popstate selection while already hidden changes just the bounded target.
  await render({ active: false, selectedId: 5000 })
  bounds()
  expect(host.querySelector('[data-story-id="5000"]')).not.toBeNull()
  await render({ active: true, selectedId: null })
  expect(document.activeElement?.getAttribute('data-story-id')).toBe('5000')
  bounds()
})

it('preserves clicked scroll/headline return, recovers filtered focused actions, and respects external focus', async () => {
  await exposeAll()
  await scroll(900)
  await act(async () => host.querySelector<HTMLButtonElement>('[data-story-id="1"]')!.click())
  expect(props.onSelect).toHaveBeenCalledWith(1)
  await render({ active: false, selectedId: 1 })
  await render({ active: true, selectedId: null })
  expect(pane().scrollTop).toBe(900)
  expect(document.activeElement?.getAttribute('data-story-id')).toBe('1')
  await scroll(offset(100) + 100)
  const read = host.querySelector<HTMLButtonElement>('[aria-label="Mark read: Story 5001"]')!
  await act(async () => {
    read.focus()
    read.click()
  })
  expect(props.onRead).toHaveBeenCalledWith(pool[5000])
  await render({ items: pool.filter((story) => story.id !== 5001) })
  expect(read.isConnected).toBe(false)
  expect(document.activeElement?.getAttribute('data-story-id')).toBe('5002')
  const outside = document.createElement('button')
  document.body.append(outside)
  await act(async () => outside.focus())
  await render({ items: pool.filter((story) => story.id !== 5001 && story.id !== 5002) })
  expect(document.activeElement).toBe(outside)
  outside.remove()
  bounds()
})

it('rejects queued frames and ResizeObserver callbacks after hiding, changing views and unmounting', async () => {
  await exposeAll({ moreServer: true, drained: false })
  const oldObserver = observers.at(-1)!
  await act(async () => {
    pane().scrollTop = offset(199) + 7000
    pane().dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  const oldFrame = allFrames.at(-1)!
  await render({ active: false, selectedId: 1 })
  const count = stories().length
  await act(async () => {
    oldFrame(0)
    oldObserver.callback([], {} as ResizeObserver)
  })
  await flush()
  expect(stories()).toHaveLength(count)
  expect(props.onLoadMore).not.toHaveBeenCalled()
  expect(oldObserver.disconnect).toHaveBeenCalled()
  await render({ active: true, selectedId: null, windowKey: 'different' })
  await act(async () => {
    oldFrame(0)
    oldObserver.callback([], {} as ResizeObserver)
  })
  await flush()
  expect(ids()[0]).toBe(1)
  expect(props.onLoadMore).not.toHaveBeenCalled()
  const currentObserver = observers.at(-1)!
  await act(async () => pane().dispatchEvent(new Event('scroll', { bubbles: true })))
  const currentFrame = allFrames.at(-1)!
  expect(frames.size).toBeGreaterThan(0)
  await act(async () => root.render(null))
  expect(currentObserver.disconnect).toHaveBeenCalled()
  await act(async () => {
    currentFrame(0)
    currentObserver.callback([], {} as ResizeObserver)
    oldFrame(0)
    oldObserver.callback([], {} as ResizeObserver)
  })
  expect(frames.size).toBe(0)
  expect(props.onLoadMore).not.toHaveBeenCalled()
})

it('pages only the true server tail, settles no-growth pages, allows explicit retry and rearms on growth', async () => {
  await exposeAll({ moreServer: true, drained: false })
  expect(props.onLoadMore).not.toHaveBeenCalled()
  await scroll(offset(100))
  expect(props.onLoadMore).not.toHaveBeenCalled()
  await scroll(pane().scrollHeight - height)
  bounds()
  expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  await render({ loadingMore: true })
  await render({ loadingMore: false })
  for (let count = 0; count < 5; count++) await resize()
  expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  const more = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Load more',
  )!
  await act(async () => {
    more.click()
    more.click()
  })
  await flush()
  expect(props.onLoadMore).toHaveBeenCalledTimes(2)
  await render({
    items: [...pool, ...Array.from({ length: 50 }, (_, index) => item(10_001 + index))],
  })
  expect(props.onLoadMore).toHaveBeenCalledTimes(2)
  // Server growth is cached but not represented until local-first exposure.
  await scroll(pane().scrollHeight - height)
  expect(props.onLoadMore).toHaveBeenCalledTimes(2)
  await act(async () => loadMore().click())
  await flush()
  expect(props.onLoadMore).toHaveBeenCalledTimes(2)
  await scroll(pane().scrollHeight - height)
  expect(props.onLoadMore).toHaveBeenCalledTimes(3)
  await render({ drained: true })
  await resize()
  expect(props.onLoadMore).toHaveBeenCalledTimes(3)
  expect(list().textContent).toContain('up to date')
  bounds()
})

it('rearms prefetch after reading shrinks the pool or a same-size sync replaces its tail', async () => {
  await exposeAll({ moreServer: true, drained: false })
  await scroll(pane().scrollHeight - height)
  expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  await render({ items: pool.slice(5000) })
  await scroll(0)
  await scroll(pane().scrollHeight - height)
  expect(props.onLoadMore).toHaveBeenCalledTimes(2)
  // A new tail is progress even if filtering keeps the visible count unchanged.
  await render({ items: [...pool.slice(5001), item(10_001)] })
  await scroll(0)
  await scroll(pane().scrollHeight - height)
  expect(props.onLoadMore).toHaveBeenCalledTimes(3)
  await resize()
  expect(props.onLoadMore).toHaveBeenCalledTimes(3)
  bounds()
})

it('allows one initial empty-pool probe without an empty-page server loop', async () => {
  await render({ items: [], moreServer: true, drained: false })
  expect(stories()).toHaveLength(0)
  expect(props.onLoadMore).toHaveBeenCalledTimes(1)
  await render({ loadingMore: true })
  await render({ loadingMore: false })
  await resize()
  expect(props.onLoadMore).toHaveBeenCalledTimes(1)
})

it('does not auto-page while a request is pending, loading, hidden or below/above the root-relative tail', async () => {
  let resolve!: () => void
  const onLoadMore = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  await render({
    items: pool.slice(0, 50),
    onLoadMore,
    moreServer: true,
    drained: false,
    loadingMore: true,
  })
  await scroll(pane().scrollHeight - height)
  expect(onLoadMore).not.toHaveBeenCalled()
  await render({ loadingMore: false })
  expect(onLoadMore).toHaveBeenCalledTimes(1)
  await resize()
  const more = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Load more',
  )!
  await act(async () => more.click())
  expect(onLoadMore).toHaveBeenCalledTimes(1)
  await render({ active: false })
  await act(async () => resolve())
  await flush()
  expect(onLoadMore).toHaveBeenCalledTimes(1)
  await render({ active: true, items: pool })
  await scroll(-1000)
  expect(onLoadMore).toHaveBeenCalledTimes(1)
})

it('leaves list mode prefix batching, selected-row inclusion and caller order/filtering intact', async () => {
  const ordered = pool.slice(0, 120).reverse()
  await render({ newspaper: false, items: ordered, drained: false, moreServer: true }, false)
  expect(host.querySelectorAll('.item')).toHaveLength(50)
  expect(host.querySelector('.newspaper-scroll')).toBeNull()
  await act(async () =>
    intersection(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  )
  expect(host.querySelectorAll('.item')).toHaveLength(100)
  expect(props.onLoadMore).not.toHaveBeenCalled()
  await render({ selectedId: 1 }, false)
  expect(host.querySelectorAll('.item')).toHaveLength(120)
  await render(
    {
      windowKey: 'filtered',
      selectedId: null,
      items: ordered.filter((story) => story.id % 2 === 0),
    },
    false,
  )
  expect(host.querySelectorAll('.item')).toHaveLength(50)
  const texts = [...host.querySelectorAll('.item-title')].map((node) => node.textContent)
  expect(texts.length).toBe(50)
  expect(texts[0]).toBe('Story 120')
  const more = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'Load more',
  )!
  await act(async () => more.click())
  expect(props.onLoadMore).toHaveBeenCalledTimes(1)
})

it('forwards feed metadata and favicon preference, groups the name with branding, and falls back safely', async () => {
  const feed = {
    id: 1,
    title: 'Fixture',
    faviconLink: 'https://fixture.invalid/favicon.png',
  } as NewsFeed
  await render({ items: [{ ...item(1), pubDate: 1000 }], feedById: () => feed })
  const image = host.querySelector<HTMLImageElement>('.feed-icon')!
  expect(image.getAttribute('src')).toBe(feed.faviconLink)
  expect(image.alt).toBe('')
  expect(image.width).toBe(16)
  const source = image.parentElement!
  expect(source.textContent).toBe('Fixture')
  expect(source.classList.contains('inline-flex')).toBe(true)
  expect(source.classList.contains('items-center')).toBe(true)
  // Wrapping utility wiring, not native geometry evidence.
  expect(source.classList.contains('max-w-full')).toBe(true)
  expect(source.lastElementChild?.classList.contains('[overflow-wrap:anywhere]')).toBe(true)
  expect(source.parentElement?.classList.contains('flex-wrap')).toBe(true)
  expect(source.nextElementSibling?.tagName).toBe('TIME')
  await act(async () => image.dispatchEvent(new Event('error')))
  expect(host.querySelector('img')).toBeNull()
  expect(source.querySelector('svg.tabler-icon-rss')?.getAttribute('aria-hidden')).toBe('true')
  await render({ showFavicons: false })
  expect(host.querySelector('.feed-icon')).toBeNull()
  expect(source.textContent).toBe('Fixture')
  await render({ showFavicons: true, feedById: () => ({ ...feed, faviconLink: null }) })
  expect(host.querySelector('.feed-icon svg.tabler-icon-rss')).not.toBeNull()
  expect(host.querySelector('img')).toBeNull()
  await render({ feedById: () => undefined })
  expect(host.querySelector('.feed-icon')).toBeNull()
  expect(source.textContent).toBe('Fixture')
  await render({ feedById: undefined })
  expect(host.querySelector('img')).toBeNull()
  expect(source.textContent).toBe('Fixture')
})

const placement = (id: number) => {
  const headline = host.querySelector<HTMLButtonElement>(`[data-story-id="${id}"]`)!
  const story = headline.closest('li')!
  return {
    column: story.parentElement!.getAttribute('aria-label'),
    role: [...story.classList].find((name) =>
      /^newspaper-(lead|feature|brief|image|standard)$/.test(name),
    ),
  }
}

it('keeps actual story nodes, columns and roles through lead and chunk-boundary deletions and rollback', async () => {
  const original = pool.slice(0, 120)
  height = 30_000
  await render({ items: original })
  const before = new Map(ids().map((id) => [id, placement(id)]))
  const survivingNode = host.querySelector('[data-story-id="53"]')
  const removed = new Set([1, 2, 49, 50, 51, 52, 74, 75])
  await render({ items: original.filter((story) => !removed.has(story.id)) })
  for (const [id, owner] of before) {
    if (!removed.has(id)) expect(placement(id)).toEqual(owner)
  }
  expect(host.querySelector('[data-story-id="53"]')).toBe(survivingNode)
  expect(host.querySelector('.newspaper-lead')).toBeNull()
  expect(host.querySelectorAll('.newspaper-story').length).toBeLessThanOrEqual(250)
  await render({ items: original })
  expect(placement(1)).toEqual(before.get(1))
  expect(placement(50)).toEqual(before.get(50))
  expect(placement(51)).toEqual(before.get(51))
  expect(host.querySelectorAll('.newspaper-lead')).toHaveLength(1)
}, 30_000)

it('appends fresh arrivals without redealing and only resets ownership for real views or column-count changes', async () => {
  const original = pool.slice(0, 85)
  height = 30_000
  await render({ items: original })
  const before = new Map(ids().map((id) => [id, placement(id)]))
  const current = original.slice(2).map((story) => ({ ...story, unread: false, starred: true }))
  await render({ items: [item(999), ...current].reverse() })
  current.forEach((story) => expect(placement(story.id)).toEqual(before.get(story.id)))
  expect(placement(999).role).not.toBe('newspaper-lead')
  expect(host.querySelector('.newspaper-lead')).toBeNull()
  width = 990 // Width changed, but still three columns.
  await resize()
  current.forEach((story) => expect(placement(story.id)).toEqual(before.get(story.id)))
  width = 700
  await resize()
  expect(host.querySelectorAll('.newspaper-column')).toHaveLength(2)
  await scroll(0)
  expect(host.querySelector('.newspaper-lead [data-story-id]')?.getAttribute('data-story-id')).toBe(
    '85',
  )
  await render({ windowKey: 'different-sort', items: current })
  expect(host.querySelector('.newspaper-lead [data-story-id]')?.getAttribute('data-story-id')).toBe(
    '3',
  )
  expect(represented()).toBe(2)
}, 30_000)

it('drops empty chunks after bulk clears and still targets reader-return by ownership rather than compacted rank', async () => {
  await render({ items: pool.slice(0, 200), selectedId: 200 })
  // Leave an empty middle section, and a very sparse first section.
  const remaining = pool.slice(0, 200).filter((story) => story.id === 1 || story.id > 100)
  await render({ items: remaining, selectedId: null })
  expect(represented()).toBe(3)
  expect(host.querySelector('[data-newspaper-chunk]')).toBeNull()
  await render({ active: false, selectedId: 151 })
  await render({ active: true, selectedId: null })
  expect(document.activeElement?.getAttribute('data-story-id')).toBe('151')
  expect(placement(151).role).toBe(`newspaper-${newspaperRole(150)}`)
  expect(host.querySelectorAll('.newspaper-story').length).toBeLessThanOrEqual(250)
})

it('calls read immediately and restores original ownership after a simulated failed optimistic read', async () => {
  const original = pool.slice(0, 85)
  height = 30_000
  let reject!: (error: Error) => void
  let reported: Error | undefined
  const request = new Promise<void>((_, fail) => {
    reject = fail
  })
  const onRead = vi.fn(() =>
    request.catch((error: Error) => {
      reported = error
    }),
  )
  await render({ items: original, onRead })
  const before = placement(2)
  const read = host.querySelector<HTMLButtonElement>('[aria-label="Mark read: Story 2"]')!
  await act(async () => {
    read.focus()
    read.click()
    // No animation frame or timer is allowed to own mutation timing.
    expect(onRead).toHaveBeenCalledExactlyOnceWith(original[1])
  })
  await render({ items: original.filter((story) => story.id !== 2) })
  expect(document.activeElement?.getAttribute('data-story-id')).toBe('3')
  const error = new Error('server rejected read')
  await act(async () => {
    reject(error)
    await request.catch(() => {})
  })
  expect(reported).toBe(error)
  await render({ items: original })
  expect(placement(2)).toEqual(before)
  expect(document.activeElement?.getAttribute('data-story-id')).toBe('3')
})

it('wires visible sort/explicit Reload motion across keyed sessions but not initial newspaper/list-mode entry', async () => {
  const originalBounds = vi
    .mocked(HTMLElement.prototype.getBoundingClientRect)
    .getMockImplementation()!
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
    this: HTMLElement,
  ) {
    const story = this.closest<HTMLElement>('.newspaper-story')
    if (!story || !this.matches('li, article, [data-story-id]')) return originalBounds.call(this)
    const section = list()
    const column = [...section.querySelectorAll('.newspaper-column')].indexOf(story.parentElement!)
    const row = [...story.parentElement!.querySelectorAll('.newspaper-story')].indexOf(story)
    const top = 128 + (column < 0 ? 0 : 200 + row * 100) - pane().scrollTop
    const left = Math.max(0, column) * 300
    return {
      top,
      bottom: top + 100,
      left,
      right: left + 250,
      width: 250,
      height: 100,
      x: left,
      y: top,
      toJSON() {},
    }
  })
  const animations: ReturnType<typeof vi.fn>[] = []
  const animate = vi.fn(() => {
    const cancel = vi.fn()
    animations.push(cancel)
    return { cancel, onfinish: null }
  })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
  try {
    const current = pool.slice(0, 5)
    await render({ items: current })
    expect(animate).not.toHaveBeenCalled()
    await render({ items: [...current].reverse(), windowKey: 'all-reversed-sort' })
    expect(animate).toHaveBeenCalledTimes(4)
    expect(
      host.querySelector('.newspaper-lead [data-story-id]')?.getAttribute('data-story-id'),
    ).toBe('5')
    await render({ items: current, windowKey: 'all:reload:1' })
    expect(animate).toHaveBeenCalledTimes(8)
    expect(
      host.querySelector('.newspaper-lead [data-story-id]')?.getAttribute('data-story-id'),
    ).toBe('1')
    await render({ newspaper: false })
    animations.forEach((cancel) => expect(cancel).toHaveBeenCalledTimes(1))
    await render({ newspaper: true })
    expect(animate).toHaveBeenCalledTimes(8)
  } finally {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate
  }
})

it('directly follows each uneven predecessor across former 50/100-story boundaries', async () => {
  height = 100_000
  const current = pool.slice(0, 155)
  current.forEach((item) => storyHeights.set(item.id, [180, 470, 900][(item.id - 2 + 3) % 3]))
  await render({ items: current, selectedId: 155 })
  await scroll(0)
  expect(host.querySelectorAll('.newspaper')).toHaveLength(1)
  expect(host.querySelector('[data-newspaper-chunk]')).toBeNull()
  for (const column of columns()) {
    const cards = [...column.querySelectorAll<HTMLElement>('.newspaper-story')]
    for (const boundary of [50, 100]) {
      const next = cards.find(
        (card) =>
          Number(card.querySelector<HTMLElement>('[data-story-id]')!.dataset.storyId) > boundary,
      )!
      const previous = next.previousElementSibling as HTMLElement
      expect(previous.classList.contains('newspaper-story')).toBe(true)
      expect(
        next.getBoundingClientRect().top - previous.getBoundingClientRect().bottom,
      ).toBeCloseTo(24)
    }
  }
  const ends = columns().map(columnHeight)
  expect(Math.max(...ends) - Math.min(...ends)).toBeGreaterThan(10_000)
  bounds()
}, 30_000)

it('closes sparse deleted slots without a lead or phantom top/bottom sections and restores ownership on rollback', async () => {
  height = 10_000
  const current = pool.slice(0, 200)
  await render({ items: current, selectedId: 200 })
  const remaining = current.filter((item) => [50, 101, 155].includes(item.id))
  await render({ items: remaining, selectedId: null })
  await scroll(0)
  expect(host.querySelector('.newspaper-lead, [data-newspaper-lead-placeholder]')).toBeNull()
  expect(columns()[1].querySelector('.newspaper-story')).toBeNull()
  for (const column of columns()) {
    for (const spacer of column.querySelectorAll<HTMLElement>('[data-newspaper-spacer]'))
      expect(spacer.style.height).toBe('0px')
    const cards = [...column.querySelectorAll<HTMLElement>('.newspaper-story')]
    if (cards.length) expect(cards[0].getBoundingClientRect().top).toBe(128)
    for (let index = 1; index < cards.length; index++)
      expect(
        cards[index].getBoundingClientRect().top - cards[index - 1].getBoundingClientRect().bottom,
      ).toBeCloseTo(24)
  }
  expect(pane().scrollHeight).toBeLessThan(1500)
  const before = placement(101)
  await render({ items: [...remaining, current[0]] })
  expect(placement(101)).toEqual(before)
  expect(host.querySelector('.newspaper-lead [data-story-id]')?.getAttribute('data-story-id')).toBe(
    '1',
  )
  expect(
    host.querySelector('[data-story-id="101"]')!.closest('li')!.getAttribute('aria-posinset'),
  ).toBe('2')
  bounds()
}, 30_000)

it('keeps the next actual visible headline anchored when its visible predecessor is removed', async () => {
  width = 440
  await render({ items: pool.slice(0, 60) })
  await scroll(1400)
  const visible = stories().filter(
    (node) => node.getBoundingClientRect().top >= 100 && node.getBoundingClientRect().top < 700,
  )
  const first = visible[0]
  const next = first
    .closest('li')!
    .nextElementSibling!.querySelector<HTMLElement>('[data-story-id]')!
  const before = next.getBoundingClientRect().top
  await render({
    items: pool.slice(0, 60).filter((item) => item.id !== Number(first.dataset.storyId)),
  })
  expect(
    host
      .querySelector<HTMLElement>(`[data-story-id="${next.dataset.storyId}"]`)!
      .getBoundingClientRect().top,
  ).toBeCloseTo(before)
  bounds()
})

it('glides surviving mounted stories for read/rollback but never for scroll-only column window swaps', async () => {
  const animate = vi.fn<
    (
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => { cancel: () => void; onfinish: null }
  >(() => ({ cancel: vi.fn(), onfinish: null }))
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
  try {
    const current = pool.slice(0, 100)
    await render({ items: current })
    expect(animate).not.toHaveBeenCalled()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Mark read: Story 2"]')!.click(),
    )
    expect(props.onRead).toHaveBeenCalledExactlyOnceWith(current[1])
    await render({ items: current.filter((item) => item.id !== 2) })
    expect(animate).toHaveBeenCalled()
    expect(animate.mock.calls[0][1]).toEqual({ duration: 180, easing: 'ease-out' })
    const count = animate.mock.calls.length
    await render({ items: current })
    expect(animate.mock.calls.length).toBeGreaterThan(count)
    animate.mockClear()
    await scroll(8000)
    expect(animate).not.toHaveBeenCalled()
  } finally {
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate
  }
})
