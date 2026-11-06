// @vitest-environment jsdom
import { act, StrictMode, useRef, type MutableRefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useNewspaperMotion, {
  newspaperHeadlineBounds,
  type NewspaperMotionSnapshot,
} from './useNewspaperMotion'

let root: Root
let host: HTMLDivElement
let reduced: boolean
let onMotionChange: () => void
let rects: Map<number, { top: number; left: number }>
let animate: ReturnType<typeof vi.fn>
let animations: { cancel: ReturnType<typeof vi.fn> }[]
let active: boolean
let windowKey: string
let ids: number[]
let scroll: number
let session: string
let ready: boolean
let columns: number
let dataRevision: number
let measurementRevision: number
let snapshot: MutableRefObject<NewspaperMotionSnapshot | null> | undefined

function Fixture() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  useNewspaperMotion(scrollRef, listRef, active, windowKey, {
    session,
    ready,
    columns,
    dataRevision,
    measurementRevision,
    snapshot,
  })
  return (
    <div ref={scrollRef}>
      <ul ref={listRef}>
        {ids.map((id) => (
          <li key={id} data-position-id={id}>
            <article>
              <button data-story-id={id}>Story {id}</button>
            </article>
          </li>
        ))}
      </ul>
    </div>
  )
}
const render = async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <Fixture key={session} />
      </StrictMode>,
    ),
  )
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  reduced = false
  active = true
  windowKey = '0,50'
  ids = [1, 2, 3]
  scroll = 0
  session = 'first'
  ready = true
  columns = 3
  dataRevision = 0
  measurementRevision = 0
  snapshot = undefined
  rects = new Map([
    [1, { top: 0, left: 0 }],
    [2, { top: 200, left: 0 }],
    [3, { top: 0, left: 300 }],
  ])
  animations = []
  animate = vi.fn(() => {
    const animation = { cancel: vi.fn(), onfinish: null }
    animations.push(animation)
    return animation
  })
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduced
    },
    addEventListener: (_: string, callback: () => void) => {
      onMotionChange = callback
    },
    removeEventListener: vi.fn(),
  }))
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.tagName === 'DIV' ? scroll : 0
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const story = this.closest<HTMLElement>('li')
    const position = rects.get(Number(story?.dataset.positionId)) ?? { top: 0, left: 0 }
    const top = position.top - (story ? scroll : 0)
    return {
      ...position,
      top,
      bottom: top + (this.tagName === 'DIV' ? 1000 : 100),
      right: position.left + 200,
      width: 200,
      height: 100,
      x: position.left,
      y: top,
      toJSON() {},
    }
  })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('glides affected-column survivors upward, not initial loads, new arrivals or unchanged refreshes', async () => {
  await render()
  expect(animate).not.toHaveBeenCalled()
  ids = [2, 3]
  rects.set(2, { top: 0, left: 0 })
  await render()
  expect(animate).toHaveBeenCalledExactlyOnceWith(
    [{ transform: 'translate(0px, 200px)' }, { transform: 'translate(0, 0)' }],
    { duration: 180, easing: 'ease-out' },
  )
  expect(animate.mock.instances[0]).toBe(host.querySelector('[data-story-id="2"]')!.parentElement)
  await render()
  expect(animate).toHaveBeenCalledTimes(1)
  expect(animations[0].cancel).not.toHaveBeenCalled()
  ids.push(4)
  rects.set(4, { top: 400, left: 300 })
  await render()
  expect(animate).toHaveBeenCalledTimes(1)
  // A rollback returning the removed story moves the survivor back down.
  ids = [1, 2, 3, 4]
  rects.set(2, { top: 200, left: 0 })
  await render()
  expect(animate.mock.calls[1][0][0]).toEqual({ transform: 'translate(0px, -200px)' })
  expect(animations[0].cancel).toHaveBeenCalledTimes(1)
})

it('animates mounted ID redistribution in both axes and cancels on virtualization, hiding and unmount', async () => {
  await render()
  rects.set(2, { top: 100, left: 300 })
  await render()
  expect(animate.mock.calls[0][0][0]).toEqual({ transform: 'translate(-300px, 100px)' })
  scroll = 80
  await render()
  expect(animate).toHaveBeenCalledTimes(1)
  windowKey = '50,100'
  rects.set(2, { top: 500, left: 300 })
  await render()
  expect(animate).toHaveBeenCalledTimes(1)
  expect(animations[0].cancel).toHaveBeenCalledTimes(1)
  rects.set(2, { top: 400, left: 300 })
  await render()
  expect(animate).toHaveBeenCalledTimes(2)
  active = false
  await render()
  expect(animations[1].cancel).toHaveBeenCalledTimes(1)
  active = true
  rects.set(2, { top: 0, left: 0 })
  await render()
  expect(animate).toHaveBeenCalledTimes(2)
  rects.set(2, { top: 100, left: 0 })
  await render()
  await act(async () => root.render(null))
  expect(animations[2].cancel).toHaveBeenCalledTimes(1)
})

it('honors initial and live reduced-motion preferences, and starts fresh when motion is reenabled', async () => {
  reduced = true
  await render()
  rects.set(2, { top: 0, left: 0 })
  await render()
  expect(animate).not.toHaveBeenCalled()
  reduced = false
  onMotionChange()
  await render()
  expect(animate).not.toHaveBeenCalled()
  rects.set(2, { top: 100, left: 0 })
  await render()
  expect(animate).toHaveBeenCalledTimes(1)
  reduced = true
  onMotionChange()
  expect(animations[0].cancel).toHaveBeenCalledTimes(1)
  await render()
  expect(animate).toHaveBeenCalledTimes(1)
})

it('keeps scroll anchors independent of an in-flight article translation', async () => {
  await render()
  const headline = host.querySelector<HTMLElement>('[data-story-id="2"]')!
  const article = headline.parentElement!
  const story = article.parentElement!
  const rect = (top: number) => ({ top, bottom: top + 100 }) as DOMRect
  headline.getBoundingClientRect = () => rect(272)
  article.getBoundingClientRect = () => rect(250)
  story.getBoundingClientRect = () => rect(200)
  expect(newspaperHeadlineBounds(headline)).toEqual({ top: 222, bottom: 322 })
})

it('animates common visible IDs across keyed sort resets without carrying nodes, animations or scroll state', async () => {
  snapshot = { current: null }
  scroll = 100
  await render()
  const oldNode = host.querySelector('[data-story-id="2"]')
  expect(animate).not.toHaveBeenCalled()
  session = 'different-sort'
  ready = false
  scroll = 0
  rects.set(2, { top: 0, left: 300 })
  rects.set(1, { top: 200, left: 0 }) // Previously offscreen; not an animated entry.
  await render()
  expect(host.querySelector('[data-story-id="2"]')).not.toBe(oldNode)
  expect(animate).not.toHaveBeenCalled()
  ready = true
  await render()
  expect(animate).toHaveBeenCalledExactlyOnceWith(
    [{ transform: 'translate(-300px, 100px)' }, { transform: 'translate(0, 0)' }],
    { duration: 180, easing: 'ease-out' },
  )
  // The new session owns cleanup. The snapshot contains geometry only.
  session = 'filtered'
  ready = false
  await render()
  expect(animations[0].cancel).toHaveBeenCalledTimes(1)
  reduced = true
  ready = true
  await render()
  expect(snapshot.current).toBeNull()
  expect(animate).toHaveBeenCalledTimes(1)
})

it('keeps reload motion alive through measurement-driven window changes but cancels true scroll swaps', async () => {
  snapshot = { current: null }
  await render()
  session = 'first:reload:1'
  ready = false
  rects.set(2, { top: 100, left: 300 })
  await render()
  ready = true
  await render()
  expect(animate).toHaveBeenCalledTimes(1)
  const initial = animations[0]
  windowKey = '0:9,0:8,0:7'
  measurementRevision++
  await render()
  expect(initial.cancel).not.toHaveBeenCalled()
  expect(animate).toHaveBeenCalledTimes(1)
  // A later height correction retargets, rather than losing the transition.
  windowKey = '0:10,0:9,0:7'
  measurementRevision++
  rects.set(2, { top: 80, left: 300 })
  await render()
  expect(animate).toHaveBeenCalledTimes(2)
  expect(initial.cancel).toHaveBeenCalledTimes(1)
  expect(animate.mock.calls[1][0][0]).toEqual({ transform: 'translate(0px, 20px)' })
  scroll = 100
  await render()
  windowKey = '1:11,1:10,1:8'
  await render()
  expect(animate).toHaveBeenCalledTimes(2)
  expect(animations[1].cancel).toHaveBeenCalledTimes(1)
})

it('allows responsive redistribution even when sparse sections rebalance into a different window', async () => {
  await render()
  columns = 2
  windowKey = '0,100'
  rects.set(2, { top: 100, left: 300 })
  await render()
  expect(animate.mock.calls[0][0][0]).toEqual({ transform: 'translate(-300px, 100px)' })
})

it('glides surviving stories when clearing the last story removes a mounted section', async () => {
  await render()
  ids = [2, 3]
  windowKey = '50'
  dataRevision++
  rects.set(2, { top: 0, left: 0 })
  await render()
  expect(animate).toHaveBeenCalledExactlyOnceWith(
    [{ transform: 'translate(0px, 200px)' }, { transform: 'translate(0, 0)' }],
    { duration: 180, easing: 'ease-out' },
  )
})

it('does not move an already anchored survivor again after a layout-driven scroll correction', async () => {
  scroll = 100
  await render()
  rects.set(2, { top: 100, left: 0 })
  scroll = 0 // Existing scroll anchoring keeps Story 2 at the same screen position.
  await render()
  expect(animate).not.toHaveBeenCalled()
})

it('retargets rapid layout changes from the current animated position and cancels the superseded animation', async () => {
  await render()
  rects.set(2, { top: 100, left: 0 })
  await render()
  const article = host.querySelector<HTMLElement>('[data-story-id="2"]')!.parentElement!
  article.getBoundingClientRect = () =>
    ({
      top: rects.get(2)!.top + 40,
      left: 0,
    }) as DOMRect
  rects.set(2, { top: 0, left: 0 })
  await render()
  expect(animate.mock.calls[1][0][0]).toEqual({ transform: 'translate(0px, 140px)' })
  expect(animations[0].cancel).toHaveBeenCalledTimes(1)
})
