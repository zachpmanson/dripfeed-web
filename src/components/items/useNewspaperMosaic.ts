import { useLayoutEffect, type RefObject } from 'react'
import type { NewsItem } from '../../api/types'
import { mosaicRowSpan } from './newspaperMosaic'

export function useNewspaperMosaic(
  listRef: RefObject<HTMLUListElement>,
  enabled: boolean,
  items: readonly NewsItem[],
) {
  useLayoutEffect(() => {
    const list = listRef.current
    if (!enabled || !list) return
    const tiles = [...list.children] as HTMLElement[]
    const content = (tile: HTMLElement) =>
      tile.classList.contains('newspaper-story') ? tile.firstElementChild : tile
    let alive = true
    let frame: number | null = null
    const measure = () => {
      if (!alive) return
      // Read natural inner content, never the assigned outer grid height. Font
      // swaps, wrapping and image changes can then resize without a feedback loop.
      const spans = tiles.map((tile) => {
        const inner = content(tile)
        const height = inner?.getBoundingClientRect().height ?? 0
        if (!height) return null // Hidden front page: retain its scroll geometry.
        if (inner === tile) return `span ${mosaicRowSpan(height)}`
        const style = getComputedStyle(tile)
        const inset = [
          style.paddingTop,
          style.paddingBottom,
          style.borderTopWidth,
          style.borderBottomWidth,
          style.marginTop,
          style.marginBottom,
        ].reduce((total, value) => total + (parseFloat(value) || 0), 0)
        return `span ${mosaicRowSpan(height + inset)}`
      })
      tiles.forEach((tile, index) => {
        const span = spans[index]
        if (span && tile.style.gridRowEnd !== span) tile.style.gridRowEnd = span
      })
    }
    const schedule = () => {
      if (!alive || frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        measure()
      })
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(list)
    tiles.forEach((tile) => {
      const inner = content(tile)
      if (inner) observer?.observe(inner)
    })
    window.addEventListener('resize', schedule)
    list.addEventListener('load', schedule, true)
    list.addEventListener('error', schedule, true)
    // ResizeObserver handles later font changes; ready also covers the initial swap.
    void document.fonts?.ready.then(schedule)
    measure()
    return () => {
      alive = false
      observer?.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      list.removeEventListener('load', schedule, true)
      list.removeEventListener('error', schedule, true)
    }
  }, [listRef, enabled, items])
}
