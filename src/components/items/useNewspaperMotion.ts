import { useLayoutEffect, useRef, type MutableRefObject, type RefObject } from 'react'

type Position = { top: number; left: number; visible: boolean }
export type NewspaperMotionSnapshot = {
  window: string
  session: string
  columns: number
  scroll: number
  positions: Map<string, Position>
}

// Scroll/focus anchors must follow layout, not an article's temporary FLIP
// transform. The article starts at its li's origin; relative headline offsets
// remain unchanged during translation.
export function newspaperHeadlineBounds(headline: HTMLElement) {
  const rect = headline.getBoundingClientRect()
  const story = headline.closest('li')!
  const article = story.firstElementChild!
  const shift = story.getBoundingClientRect().top - article.getBoundingClientRect().top
  return { top: rect.top + shift, bottom: rect.bottom + shift }
}

/** FLIP only surviving mounted stories. Measure the untransformed li, animate
 * its article: in-flight transforms never contaminate the next layout snapshot. */
export default function useNewspaperMotion(
  scrollRef: RefObject<HTMLDivElement>,
  listRef: RefObject<HTMLUListElement>,
  active: boolean,
  window: string,
  {
    ready = true,
    session = '',
    columns = 0,
    snapshot,
  }: {
    ready?: boolean
    session?: string
    columns?: number
    snapshot?: MutableRefObject<NewspaperMotionSnapshot | null>
  } = {},
) {
  const localSnapshot = useRef<NewspaperMotionSnapshot | null>(null)
  const previous = snapshot ?? localSnapshot
  const animations = useRef(new Map<HTMLElement, Animation>())

  useLayoutEffect(() => {
    const running = animations.current
    const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    const cancel = () => {
      for (const animation of running.values()) animation.cancel()
      running.clear()
    }
    const onChange = () => {
      if (media?.matches) {
        cancel()
        previous.current = null
      }
    }
    media?.addEventListener('change', onChange)
    return () => {
      media?.removeEventListener('change', onChange)
      cancel()
      // Only lightweight geometry survives a keyed view reset. No animations,
      // nodes, paging or reader-return state escape the old session.
      if (!snapshot) previous.current = null
    }
  }, [previous, snapshot])

  useLayoutEffect(() => {
    const root = scrollRef.current
    const list = listRef.current
    const running = animations.current
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!active || !root || !list || reduced || !ready) {
      for (const animation of running.values()) animation.cancel()
      running.clear()
      // Initial width resolution must not erase a previous view's snapshot.
      if (!active || reduced) previous.current = null
      return
    }
    const origin = root.getBoundingClientRect()
    const positions = new Map<string, Position>()
    const present = new Set<HTMLElement>()
    const saved = previous.current
    const reset = saved !== null && saved.session !== session
    const old =
      saved && (saved.window === window || saved.columns !== columns || reset) ? saved : null
    for (const headline of list.querySelectorAll<HTMLElement>('[data-story-id]')) {
      const story = headline.closest('li')!
      const article = story.firstElementChild as HTMLElement
      present.add(article)
      const rect = story.getBoundingClientRect()
      const position = {
        top: rect.top - origin.top + root.scrollTop,
        left: rect.left - origin.left + root.scrollLeft,
        visible: rect.bottom > origin.top && rect.top < origin.bottom,
      }
      const id = headline.dataset.storyId!
      positions.set(id, position)
      const from = old?.positions.get(id)
      if (!from || typeof article.animate !== 'function') continue
      // A real view/sort reset also resets scroll. Animate common visible IDs
      // in viewport coordinates, never fling an overscanned/deep story across it.
      if (reset && (!from.visible || !position.visible)) continue
      const layoutX = from.left - position.left
      const layoutY = from.top - position.top
      // Ignore scrolling alone, but account for scroll-anchor corrections when
      // layout really moved: an already anchored headline must not jump twice.
      if (!reset && Math.abs(layoutX) < 1 && Math.abs(layoutY) < 1) continue
      const ongoing = running.get(article)
      const visual = ongoing ? article.getBoundingClientRect() : rect
      const x = layoutX + visual.left - rect.left
      const y = layoutY - (old!.scroll - root.scrollTop) + visual.top - rect.top
      // Retarget a rapid second read from its current visual position instead
      // of snapping back to the previous animation's destination.
      ongoing?.cancel()
      running.delete(article)
      if (Math.abs(x) < 1 && Math.abs(y) < 1) continue
      const animation = article.animate(
        [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 180, easing: 'ease-out' },
      )
      running.set(article, animation)
      animation.onfinish = () => {
        if (running.get(article) === animation) running.delete(article)
      }
    }
    for (const [article, animation] of running) {
      // A scroll-induced window swap is not a layout transition.
      if (!present.has(article) || !old) {
        animation.cancel()
        running.delete(article)
      }
    }
    previous.current = { window, session, columns, scroll: root.scrollTop, positions }
  })
}
