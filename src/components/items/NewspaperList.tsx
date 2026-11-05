import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ItemListProps } from './ItemList'
import NewspaperStory from './NewspaperStory'
import TrailingRow from './TrailingRow'
import { newspaperRole } from './newspaperPresentation'
import {
  chunkAt,
  estimatedChunkHeight,
  newspaperChunks,
  newspaperColumnCount,
  newspaperColumnIndices,
  newspaperRange,
  NEWSPAPER_CHUNK_SIZE,
  type NewspaperChunk,
} from './newspaperVirtualization'

type Measurement = { width: number; height: number }
type Model = { chunks: NewspaperChunk[]; offsets: number[] }
type Anchor = { id: number; chunk: number; fraction: number }
type VisualAnchor = { id: string; offset: number; scroll: number }

function anchorAt(model: Model, top: number): Anchor | null {
  const chunk = chunkAt(model.offsets, top)
  const part = model.chunks[chunk]
  if (!part) return null
  return {
    id: part.items[0].id,
    chunk,
    fraction: Math.max(
      0,
      Math.min(1, (top - model.offsets[chunk]) / (model.offsets[chunk + 1] - model.offsets[chunk])),
    ),
  }
}

function anchorTop(model: Model, anchor: Anchor): number {
  const found = model.chunks.findIndex((part) => part.items.some((item) => item.id === anchor.id))
  const chunk = found < 0 ? Math.min(anchor.chunk, model.chunks.length - 1) : found
  return chunk < 0
    ? 0
    : model.offsets[chunk] + anchor.fraction * (model.offsets[chunk + 1] - model.offsets[chunk])
}

/** Whole round-robin stack sections are the virtualization unit. Offscreen sections
 * retain measured (or width-aware estimated) height, never their story DOM. */
export default function NewspaperList({
  items,
  active = true,
  selectedId,
  feedTitle,
  singleClickRead = false,
  onSelect,
  onRead,
  onStar,
  emptyText = 'No unread items. Nothing dripping?',
  onLoadMore,
  moreServer = false,
  drained = false,
  loadingMore = false,
  paging = null,
}: ItemListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const sentinelRef = useRef<HTMLLIElement>(null)
  const sectionNodes = useRef(new Map<number, HTMLDivElement>())
  const selectedIndex = selectedId === null ? -1 : items.findIndex((item) => item.id === selectedId)
  const selectedCount =
    selectedIndex < 0
      ? 0
      : (Math.floor(selectedIndex / NEWSPAPER_CHUNK_SIZE) + 1) * NEWSPAPER_CHUNK_SIZE
  const [revealedCount, setRevealedCount] = useState(() =>
    Math.max(NEWSPAPER_CHUNK_SIZE * 2, selectedCount),
  )
  // A hidden URL change must represent its target in this commit, without
  // ever mounting the prefix. Only the existing windowKey remount resets it.
  const representedCount = Math.max(revealedCount, selectedCount)
  useLayoutEffect(() => {
    if (selectedCount > revealedCount) setRevealedCount(selectedCount)
  }, [selectedCount, revealedCount])
  const hiddenLocal = items.length > representedCount
  const chunks = useMemo(
    () => newspaperChunks(items.slice(0, representedCount)),
    [items, representedCount],
  )
  const [geometry, setGeometry] = useState(() => ({
    width: 900,
    measurements: new Map<string, Measurement>(),
    top: 0,
    height: 0,
    target:
      selectedId === null
        ? null
        : Math.max(
            0,
            Math.floor(items.findIndex((item) => item.id === selectedId) / NEWSPAPER_CHUNK_SIZE),
          ),
  }))
  const model = useMemo<Model>(() => {
    const offsets = [0]
    for (const chunk of chunks) {
      const measured = geometry.measurements.get(chunk.signature)
      const height =
        measured?.width === geometry.width
          ? measured.height
          : estimatedChunkHeight(chunk.items.length, geometry.width, chunk.start === 0)
      offsets.push(offsets[offsets.length - 1] + height)
    }
    return { chunks, offsets }
  }, [chunks, geometry.measurements, geometry.width])
  const columnCount = newspaperColumnCount(geometry.width)
  const previousModel = useRef(model)
  const pendingAnchor = useRef<Anchor | null>(null)
  const visualAnchor = useRef<VisualAnchor | null>(null)
  let rangeTarget = geometry.target
  if (rangeTarget === null && previousModel.current !== model) {
    // Keep the anchor's section mounted during the measurement commit itself.
    // Using the old pixel top with new width/height estimates could otherwise
    // evict it before the layout effect gets a chance to restore its position.
    const anchor = pendingAnchor.current ?? anchorAt(previousModel.current, geometry.top)
    const visual = visualAnchor.current
    const id =
      visual && Math.abs(visual.scroll - (scrollRef.current?.scrollTop ?? 0)) < 1
        ? Number(visual.id)
        : anchor?.id
    const found = chunks.findIndex((part) => part.items.some((item) => item.id === id))
    rangeTarget = found < 0 ? Math.min(anchor?.chunk ?? 0, Math.max(0, chunks.length - 1)) : found
  }
  const range = newspaperRange(model.offsets, geometry.top, geometry.height, rangeTarget)
  const returnTo = useRef<{ id: number; scroll: number | null } | null>(
    selectedId === null ? null : { id: selectedId, scroll: null },
  )
  const wasActive = useRef(active)
  const focusReturn = useRef(false)
  const focusedStory = useRef<{ node: HTMLElement; index: number } | null>(null)
  const enabled = useRef(active)
  enabled.current = active

  // The content origin includes the pane's padding, unlike scrollTop itself.
  const contentOrigin = useCallback(() => {
    const root = scrollRef.current
    const list = listRef.current
    return root && list
      ? list.getBoundingClientRect().top -
          root.getBoundingClientRect().top +
          root.scrollTop -
          root.clientTop
      : 0
  }, [])

  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      if (!listRef.current?.contains(event.target as Node)) focusedStory.current = null
    }
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [])

  // Keep hidden deep-link selections bounded too. A clicked selection already
  // has an exact scroll return; a new URL selection maps directly to its chunk.
  useLayoutEffect(() => {
    if (!active && selectedId !== null && returnTo.current?.id !== selectedId) {
      returnTo.current = { id: selectedId, scroll: null }
      const index = items.findIndex((item) => item.id === selectedId)
      setGeometry((old) => ({
        ...old,
        target: Math.max(0, Math.floor(index / NEWSPAPER_CHUNK_SIZE)),
      }))
    }
  }, [active, selectedId, items])

  const refreshRef = useRef<() => void>(() => {})
  const scheduleRef = useRef<() => void>(() => {})
  const pendingRequest = useRef(false)
  // An empty/filtered page must not create an automatic cursor loop. Compare
  // the current window, not a count high-water mark: reading/removing stories
  // can shrink it before a later successful page. The button can always retry.
  const lastAutoWindow = useRef<string | null>(null)
  const tailApproach = useRef(false)
  // Measurement updates do not arm exposure; a scroll authorizes one local
  // step, which may become near-tail after a later viewport resize.
  const localApproach = useRef(false)
  const requestServer = (manual: boolean) => {
    if (
      !enabled.current ||
      hiddenLocal ||
      !onLoadMore ||
      !moreServer ||
      drained ||
      loadingMore ||
      pendingRequest.current
    )
      return
    const window = `${items.length}:${items[0]?.id}:${items[items.length - 1]?.id}`
    if (!manual && lastAutoWindow.current === window) return
    lastAutoWindow.current = window
    tailApproach.current = true
    pendingRequest.current = true
    const finish = () => {
      pendingRequest.current = false
      scheduleRef.current()
    }
    try {
      void Promise.resolve(onLoadMore()).then(finish, finish)
    } catch {
      finish()
    }
  }

  const revealOrRequest = (manual: boolean) => {
    if (!enabled.current || loadingMore || pendingRequest.current) return
    if (hiddenLocal) {
      if (!manual && !localApproach.current) return
      localApproach.current = false
      tailApproach.current = true
      setRevealedCount((old) => Math.max(old, representedCount) + NEWSPAPER_CHUNK_SIZE)
    } else requestServer(manual)
  }

  const rememberVisualAnchor = useCallback(() => {
    const root = scrollRef.current
    if (!root) return
    const bounds = root.getBoundingClientRect()
    const headlines = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-story-id]') ?? []
    for (const headline of headlines) {
      const rect = headline.getBoundingClientRect()
      if (rect.bottom > bounds.top && rect.top < bounds.bottom) {
        visualAnchor.current = {
          id: headline.dataset.storyId!,
          offset: rect.top - bounds.top,
          scroll: root.scrollTop,
        }
        return
      }
    }
    visualAnchor.current = null
  }, [])

  const measure = useCallback(() => {
    const root = scrollRef.current
    const list = listRef.current
    if (!active || !root || !list) return
    const width = list.clientWidth || Math.max(0, root.clientWidth - 80) || geometry.width
    let measurements = geometry.measurements
    for (const [index, node] of sectionNodes.current) {
      const chunk = chunks[index]
      if (!chunk) continue
      const height = node.getBoundingClientRect().height
      const old = measurements.get(chunk.signature)
      if (height > 0 && (!old || old.width !== width || Math.abs(old.height - height) >= 1)) {
        if (measurements === geometry.measurements) {
          // Retain only this dataset/width, bounding the measurement cache too.
          const signatures = new Set(chunks.map((part) => part.signature))
          measurements = new Map(
            [...measurements].filter(
              ([key, value]) => signatures.has(key) && value.width === width,
            ),
          )
        }
        measurements.set(chunk.signature, { width, height })
      }
    }
    const top = Math.max(0, root.scrollTop - contentOrigin())
    if (measurements !== geometry.measurements || width !== geometry.width) {
      pendingAnchor.current = anchorAt(model, top)
      const saved = visualAnchor.current
      if (
        !saved ||
        Math.abs(saved.scroll - root.scrollTop) >= 1 ||
        !list.querySelector(`[data-story-id="${saved.id}"]`)
      ) {
        // A fast jump may have evicted the old anchor. Capture a newly mounted
        // visible headline before committing the corrected placeholder heights.
        rememberVisualAnchor()
      }
    }
    if (
      measurements !== geometry.measurements ||
      width !== geometry.width ||
      top !== geometry.top ||
      root.clientHeight !== geometry.height ||
      geometry.target !== null ||
      rangeTarget !== geometry.target
    ) {
      setGeometry({ width, measurements, top, height: root.clientHeight, target: null })
    }
    if (measurements === geometry.measurements && width === geometry.width) rememberVisualAnchor()
  }, [active, chunks, geometry, model, rangeTarget, contentOrigin, rememberVisualAnchor])

  refreshRef.current = () => {
    if (!enabled.current) return
    measure()
    const root = scrollRef.current
    if (!root || root.clientHeight <= 0) return
    // Expose one local chunk before considering the server tail.
    // Two viewports (at least 1200px) buys time before the reader reaches it.
    const margin = Math.max(1200, root.clientHeight * 2)
    const top = root.scrollTop - contentOrigin()
    const near =
      (chunks.length === 0 || range.last === chunks.length - 1) &&
      top >= -margin &&
      top + root.clientHeight + margin >= model.offsets[model.offsets.length - 1] &&
      root.scrollHeight - root.scrollTop - root.clientHeight <= margin
    if (!near) tailApproach.current = false
    // One automatic step per approach, not a chain of small server pages
    // just because a generous prefetch margin still contains the new tail.
    else if (!tailApproach.current) revealOrRequest(false)
  }

  useLayoutEffect(() => {
    const root = scrollRef.current
    const list = listRef.current
    if (!root || !list) return
    const returning = active && !wasActive.current
    wasActive.current = active
    if (!active) {
      focusedStory.current = null
      return
    }
    if (returning) {
      const saved = returnTo.current
      const index = saved ? items.findIndex((item) => item.id === saved.id) : -1
      root.scrollTop =
        saved?.scroll ??
        (index < 0 ? 0 : model.offsets[Math.floor(index / NEWSPAPER_CHUNK_SIZE)] + contentOrigin())
      focusReturn.current = true
      pendingAnchor.current = null
      rememberVisualAnchor()
    } else if (previousModel.current !== model) {
      const visual = visualAnchor.current
      const headline =
        visual && Math.abs(visual.scroll - root.scrollTop) < 1
          ? list.querySelector<HTMLButtonElement>(`[data-story-id="${visual.id}"]`)
          : null
      if (headline && visual) {
        // Preserve an actual visible headline through column reflow.
        // Fractional chunk anchoring is the fallback for evicted/deleted nodes.
        root.scrollTop +=
          headline.getBoundingClientRect().top - root.getBoundingClientRect().top - visual.offset
      } else {
        const anchor = pendingAnchor.current ?? anchorAt(previousModel.current, geometry.top)
        if (anchor) root.scrollTop = anchorTop(model, anchor) + contentOrigin()
      }
      pendingAnchor.current = null
    }
    previousModel.current = model
    measure()
    // Width-driven stack redistribution needs a commit before revealing a
    // hidden-pane URL selection; the old columns may place it at another row.
    const width = list.clientWidth || Math.max(0, root.clientWidth - 80) || geometry.width
    if (focusReturn.current && width === geometry.width) {
      const story = returnTo.current
        ? list.querySelector<HTMLButtonElement>(`[data-story-id="${returnTo.current.id}"]`)
        : null
      // A range update may need one synchronous commit before the target exists.
      const index = returnTo.current
        ? items.findIndex((item) => item.id === returnTo.current!.id)
        : -1
      const target = Math.floor(index / NEWSPAPER_CHUNK_SIZE)
      if (!story && index >= 0 && (target < range.first || target > range.last)) {
        setGeometry((old) => ({ ...old, target }))
      } else {
        if (story && returnTo.current?.scroll === null) {
          // A URL selection has no saved pixel position. Reveal its headline,
          // not just the beginning of a potentially very tall section.
          root.scrollTop +=
            story.getBoundingClientRect().top - root.getBoundingClientRect().top - contentOrigin()
          measure()
          rememberVisualAnchor()
        }
        ;(story ?? list).focus({ preventScroll: true })
        focusReturn.current = false
      }
    }
    const focused = focusedStory.current
    if (focused && !focused.node.isConnected) {
      focusedStory.current = null
      if (!document.activeElement || document.activeElement === document.body) {
        // Stack DOM order differs from rank. Recover the same (or next ranked)
        // headline when redistribution/removal disconnects the focused node.
        const stories = [...list.querySelectorAll<HTMLButtonElement>('[data-story-id]')].sort(
          (a, b) =>
            Number(a.closest('li')?.getAttribute('aria-posinset')) -
            Number(b.closest('li')?.getAttribute('aria-posinset')),
        )
        const next = stories.find(
          (story) =>
            Number(story.closest('li')?.getAttribute('aria-posinset')) - 1 >= focused.index,
        )
        ;(next ?? stories[stories.length - 1] ?? list).focus({ preventScroll: true })
      }
    }
    scheduleRef.current()
  }, [
    active,
    model,
    measure,
    items,
    geometry.top,
    geometry.width,
    range.first,
    range.last,
    contentOrigin,
    rememberVisualAnchor,
  ])

  // One generation-scoped rAF coalesces scroll, resize, image/font reflow and
  // server completion. Disconnected observers/queued old frames are inert.
  useEffect(() => {
    if (!active) return
    let alive = true
    let frame: number | null = null
    const schedule = () => {
      if (!alive || frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        if (alive) refreshRef.current()
      })
    }
    scheduleRef.current = schedule
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    if (scrollRef.current) observer?.observe(scrollRef.current)
    for (const node of sectionNodes.current.values()) observer?.observe(node)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      alive = false
      if (frame !== null) cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
      scheduleRef.current = () => {}
    }
  }, [active, range.first, range.last, chunks])

  useEffect(() => {
    scheduleRef.current()
  }, [active, loadingMore, moreServer, drained, items, paging, onLoadMore])

  const selectStory = useCallback(
    (id: number) => {
      returnTo.current = { id, scroll: scrollRef.current?.scrollTop ?? 0 }
      onSelect(id)
    },
    [onSelect],
  )

  const renderStory = (chunk: NewspaperChunk, localIndex: number) => (
    <NewspaperStory
      key={chunk.items[localIndex].id}
      item={chunk.items[localIndex]}
      index={chunk.start + localIndex}
      total={items.length}
      role={newspaperRole(chunk.start + localIndex)}
      feedTitle={feedTitle}
      singleClickRead={singleClickRead}
      onSelect={selectStory}
      onRead={onRead}
      onStar={onStar}
    />
  )

  return (
    <div
      ref={scrollRef}
      onScroll={() => {
        if (!enabled.current) return
        localApproach.current = true
        scheduleRef.current()
      }}
      className="newspaper-scroll min-h-0 flex-1 overflow-y-auto bg-app-panel px-10 py-7 [overflow-anchor:none]"
    >
      <ul
        ref={listRef}
        tabIndex={-1}
        aria-label="Newspaper stories"
        className="newspaper-chunks m-0 list-none p-0"
        onFocusCapture={(event) => {
          if (!active) return
          const node = event.target as HTMLElement
          const story = node.closest('.newspaper-story')
          focusedStory.current = story
            ? { node, index: Number(story.getAttribute('aria-posinset')) - 1 }
            : null
        }}
      >
        {chunks.map((chunk, index) => (
          <li key={index} className="flow-root list-none" role="presentation">
            {index >= range.first && index <= range.last ? (
              <div
                ref={(node) => {
                  if (node) sectionNodes.current.set(index, node)
                  else sectionNodes.current.delete(index)
                }}
                className="newspaper grid items-start gap-x-7"
                style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
                role="group"
                aria-label={`Stories ${chunk.start + 1}–${chunk.start + chunk.items.length}`}
                data-newspaper-chunk={index}
              >
                {chunk.start === 0 && (
                  <ul className="col-span-full m-0 list-none p-0" aria-label="Lead story">
                    {renderStory(chunk, 0)}
                  </ul>
                )}
                {newspaperColumnIndices(chunk.items.length, columnCount, chunk.start === 0).map(
                  (indices, column) => (
                    <ul
                      key={column}
                      className="newspaper-column m-0 min-w-0 list-none p-0"
                      aria-label={`Column ${column + 1}`}
                    >
                      {indices.map((localIndex) => renderStory(chunk, localIndex))}
                    </ul>
                  ),
                )}
              </div>
            ) : (
              <div
                aria-hidden="true"
                data-newspaper-placeholder={index}
                style={{ height: model.offsets[index + 1] - model.offsets[index] }}
              />
            )}
          </li>
        ))}
        {items.length === 0 && <li className="empty px-3 py-4 text-app-muted">{emptyText}</li>}
        <TrailingRow
          sentinelRef={sentinelRef}
          onLoadMore={() => revealOrRequest(true)}
          moreServer={hiddenLocal || moreServer}
          drained={!hiddenLocal && drained}
          loadingMore={loadingMore}
          paging={paging}
        />
      </ul>
    </div>
  )
}
