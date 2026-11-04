// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NewsItem } from '../../api/types'
import { useNewspaperMosaic } from './useNewspaperMosaic'

let root: Root, container: HTMLDivElement
let callbacks: ResizeObserverCallback[]
let observers: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[]
let frames: Map<number, FrameRequestCallback>
let nextFrame: number
let heights: Record<string, number>
const items = [1, 2, 3].map((id) => ({ id }) as NewsItem)
function Fixture({ stories = items, active = true }: { stories?: NewsItem[]; active?: boolean }) {
  const ref = useRef<HTMLUListElement>(null)
  useNewspaperMosaic(ref, active, stories)
  return (
    <ul ref={ref}>
      {stories.map((item) => (
        <li
          key={item.id}
          className="newspaper-story"
          style={{ paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid' }}
        >
          <article data-id={item.id}>Story {item.id}</article>
        </li>
      ))}
      <li data-id="tail">Up to date</li>
    </ul>
  )
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  callbacks = []
  observers = []
  frames = new Map()
  nextFrame = 0
  heights = { '1': 101, '2': 205.5, '3': 59, tail: 33 }
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback)
        observers.push(this)
      }
    },
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      frames.set(++nextFrame, cb)
      return nextFrame
    }),
  )
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id)),
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return { height: heights[this.dataset.id ?? ''] ?? 0 } as DOMRect
  })
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
const spans = () => [...container.querySelectorAll('li')].map((li) => li.style.gridRowEnd)
const notify = () => callbacks.at(-1)!([], {} as ResizeObserver)
const flush = () => {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback(0))
}

it('measures independent inner content, insets and natural status rows without changing order', async () => {
  await act(async () => root.render(<Fixture />))
  expect(spans()).toEqual(['span 38', 'span 64', 'span 27', 'span 9'])
  expect(observers[0].observe.mock.calls.map(([node]) => node.tagName)).toEqual([
    'UL',
    'ARTICLE',
    'ARTICLE',
    'ARTICLE',
    'LI',
  ])
  expect([...container.querySelectorAll('article')].map((node) => node.dataset.id)).toEqual([
    '1',
    '2',
    '3',
  ])
  // Simulated content measurements only: jsdom does not prove grid geometry.
  heights['1'] = 151.5
  notify()
  notify()
  expect(frames.size).toBe(1)
  flush()
  expect(spans()[0]).toBe('span 51')
  notify()
  flush()
  expect(spans()[0]).toBe('span 51')
  heights['1'] = 0
  notify()
  flush()
  expect(spans()[0]).toBe('span 51')
})

it('responds to resize/image/font notifications and cleans up pending work and late callbacks', async () => {
  let fontsReady!: () => void
  const fonts = new Promise<void>((resolve) => {
    fontsReady = resolve
  })
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fonts } })
  await act(async () => root.render(<Fixture />))
  heights['2'] = 300
  window.dispatchEvent(new Event('resize'))
  container.querySelector('article')!.dispatchEvent(new Event('load'))
  expect(frames.size).toBe(1)
  flush()
  expect(spans()[1]).toBe('span 88')
  await act(async () => fontsReady())
  expect(frames.size).toBe(1)
  const stale = callbacks[0]
  await act(async () => root.render(<Fixture active={false} />))
  expect(observers[0].disconnect).toHaveBeenCalledOnce()
  expect(frames.size).toBe(0)
  stale([], {} as ResizeObserver)
  window.dispatchEvent(new Event('resize'))
  container.querySelector('article')!.dispatchEvent(new Event('error'))
  expect(frames.size).toBe(0)
  Reflect.deleteProperty(document, 'fonts')
})

it.each([0, 1, 2, 9, 51])(
  'reconciles %s ordered stories without duplicates and disconnects replaced observers',
  async (count) => {
    await act(async () => root.render(<Fixture />))
    const stories = Array.from({ length: count }, (_, i) => ({ id: i + 10 }) as NewsItem)
    await act(async () => root.render(<Fixture stories={stories} />))
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(
      [...container.querySelectorAll('article')].map((node) => Number(node.dataset.id)),
    ).toEqual(stories.map((item) => item.id))
    expect(observers.at(-1)!.observe).toHaveBeenCalledTimes(count + 2)
    await act(async () => root.unmount())
    expect(observers.at(-1)!.disconnect).toHaveBeenCalledOnce()
  },
)
