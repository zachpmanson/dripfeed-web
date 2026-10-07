import { useEffect, useRef, useState } from 'react'
import type { NewsItem, NewsFeed } from '../../api/types'
import type { RarityInfo } from '../../rarity'
import type { LoadMoreProgress } from '../../store'
import ItemRow from './ItemRow'
import TrailingRow from './TrailingRow'

/**
 * How many rows the list renders up front, and how many more each batch adds
 * when the reader reaches the trailing edge.
 *
 * The pool behind an unread/"all" view is the whole unread set from one
 * no-limit server request — thousands of items — so handing the filtered
 * list straight to the DOM produced an enormous list and a scrollbar whose
 * position meant nothing. This caps *rendering*, not fetching: the pool, the
 * ranking, the rarity sample, the unread counts and the server cursors are
 * all untouched. Deliberately not full virtualisation — no spacer rows, no
 * absolute positioning; a growing window is enough to keep the DOM small.
 */
const RENDER_BATCH = 50

interface Props {
  items: NewsItem[]
  /**
   * Identity of the *view* this list belongs to — feed/folder/all/starred,
   * show mode and sort mode, but never the data. The render window restarts
   * when this changes and only when this changes (see below).
   */
  windowKey: string
  selectedId: number | null
  feedTitle: (feedId: number) => string
  feedById?: (feedId: number) => NewsFeed | undefined
  showFavicons?: boolean
  singleClickRead?: boolean
  onSelect: (id: number) => void
  onRead: (item: NewsItem) => void // optimistic removal hook once read
  rarityMode?: boolean
  rarityStats?: Map<number, RarityInfo>
  emptyText?: string
  onLoadMore?: () => void
  moreServer?: boolean // a live cursor in the current view still pages deeper
  drained?: boolean // view's feeds are all paged to the server end
  loadingMore?: boolean
  paging?: LoadMoreProgress | null
}

export function ItemList({
  items,
  windowKey,
  selectedId,
  feedTitle,
  feedById,
  showFavicons = true,
  singleClickRead = false,
  onSelect,
  onRead,
  rarityMode = false,
  rarityStats,
  emptyText = 'No unread items. Nothing dripping?',
  onLoadMore,
  moreServer = false,
  drained = false,
  loadingMore = false,
  paging = null,
}: Props) {
  // The render window: how many of the caller's ordered items are in the DOM.
  // Held with the key of the view it belongs to, so a view change restarts it
  // during render — React's "adjust state when a prop changes" pattern, which
  // avoids a frame where the new view renders the old view's window. It is
  // never restarted on a *data* change: a sync that appends or removes items
  // must not snap the reader back to 50, which would be the original complaint
  // a second time.
  const [renderWindow, setRenderWindow] = useState<{ key: string; count: number }>({
    key: windowKey,
    count: RENDER_BATCH,
  })
  if (renderWindow.key !== windowKey) {
    setRenderWindow({ key: windowKey, count: RENDER_BATCH })
  }
  const renderCount = renderWindow.key === windowKey ? renderWindow.count : RENDER_BATCH

  // Never hide the reader's own selection. A deep link, a restored selection,
  // or a selection left over after items were read elsewhere can sit beyond
  // the window; extend it to include that row — a selected item that isn't in
  // the DOM is a worse bug than a long list. Grow-only: moving the selection on
  // does not shrink the window back.
  const selectedIndex =
    selectedId === null ? -1 : items.findIndex((i) => i.id === selectedId)
  const limit = Math.max(renderCount, selectedIndex + 1)
  useEffect(() => {
    if (selectedIndex >= renderCount) {
      setRenderWindow((w) => ({ ...w, count: selectedIndex + 1 }))
    }
  }, [selectedIndex, renderCount])

  // Auto-advance the tail: when the trailing row scrolls into view (a little
  // before the actual bottom) either render the next batch of rows the pool
  // already holds, or page the next server batch — natural infinite scroll.
  const sentinelRef = useRef<HTMLLIElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore
  // What the tail can do right now: either the window hasn't consumed the rows
  // the pool already holds, or the view can still page the server. Growing the
  // window touches no network, so it is never blocked by a fetch.
  const tailHasWork = limit < items.length || (moreServer && !drained)
  const workRef = useRef(tailHasWork)
  workRef.current = tailHasWork
  // The observer additionally stays quiet while a fetch is in flight (the next
  // scroll after it lands re-enters the margin, or the chain below re-checks),
  // so scrolling during a page doesn't stack calls; the store no-ops them
  // anyway.
  const activeRef = useRef(false)
  activeRef.current = tailHasWork && !loadingMore
  const itemsRef = useRef(items)
  itemsRef.current = items
  const limitRef = useRef(limit)
  limitRef.current = limit

  // One step of the tail, in this order:
  //   1. rows the pool already holds that the window hasn't rendered — add one
  //      batch of them to the window;
  //   2. nothing local left — page the server exactly as before, so the render
  //      cap never swallows the cursor walk: reaching the bottom of the loaded
  //      data still pulls more data.
  const advanceRef = useRef<() => void>(() => {})
  advanceRef.current = () => {
    if (limitRef.current < itemsRef.current.length) {
      setRenderWindow((w) => ({
        key: w.key,
        count: Math.max(w.count, limitRef.current) + RENDER_BATCH,
      }))
    } else {
      onLoadMoreRef.current?.()
    }
  }

  // One step in flight at a time: while a batch is pending the observer stays
  // quiet, and re-arms only once that batch has landed and been re-checked (the
  // rAF chain below) — so a batch that is still rendering cannot re-trigger
  // itself in a loop.
  const inFlight = useRef(false)
  const chain = useRef(false)

  // A view change is a clean slate for the tail: a step the previous view left
  // pending must not grow/page against the new view's list. Declared before
  // the chain effect so the flag is cleared first on the commit where the view
  // changes; the new view's own tail is then picked up by the observer as the
  // reader scrolls.
  useEffect(() => {
    chain.current = false
    inFlight.current = false
  }, [windowKey])

  // Chained advance: after a batch lands, WAIT for the list to re-render (two
  // rAFs) before re-checking whether the sentinel is still near the viewport.
  // Re-checking synchronously saw the pre-render layout, so
  // getBoundingClientRect kept reporting the sentinel in-range and the loop
  // never terminated.
  useEffect(() => {
    if (!chain.current) return
    chain.current = false
    let alive = true
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!alive) return
        const el = sentinelRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        inFlight.current = false
        // New rows pushed the sentinel below the fill line already? Then this
        // batch filled the screen: stop until the reader scrolls. (Gated on
        // `workRef`, not `activeRef`: a page that lands in the same commit that
        // clears `loadingMore` must not stop the walk early — the store dedupes
        // any call that arrives while a fetch is genuinely still running.)
        if (rect.top <= window.innerHeight + 400 && workRef.current) {
          // Still on/near screen and the tail has more to do: advance again.
          inFlight.current = true
          advanceRef.current()
          chain.current = true // re-arm for the next completion
        }
      })
    })
    return () => {
      alive = false
      cancelAnimationFrame(raf1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, renderCount])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (!e) return
        // Left the margin: the next approach is a fresh entry, so a batch may
        // be requested again.
        if (!e.isIntersecting) {
          inFlight.current = false
          return
        }
        // Only advance when the tail has something to do and no step is
        // already pending; otherwise (drained/loading) do nothing.
        if (!activeRef.current || inFlight.current) return
        inFlight.current = true
        advanceRef.current()
        chain.current = true
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Order AND filtering are owned by the caller (App applies newest or rarity,
  // and the view/show-mode filters); never re-sort or re-filter here or the
  // toggles silently no-op. This only slices the head of that ordered list for
  // the DOM — filter/order first, slice second, or a filtered view would render
  // fewer than a batch and miss matches.
  const rendered = limit >= items.length ? items : items.slice(0, limit)

  return (
    <ul className="item-list">
      {rendered.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          feedTitle={feedTitle}
          feedById={feedById}
          showFavicons={showFavicons}
          singleClickRead={singleClickRead}
          onSelect={onSelect}
          onRead={onRead}
          rarityMode={rarityMode}
          rarityStats={rarityStats}
        />
      ))}
      {items.length === 0 && <li className="empty muted">{emptyText}</li>}
      <TrailingRow
        sentinelRef={sentinelRef}
        onLoadMore={onLoadMore}
        moreServer={moreServer}
        drained={drained}
        loadingMore={loadingMore}
        paging={paging}
      />
    </ul>
  )
}
