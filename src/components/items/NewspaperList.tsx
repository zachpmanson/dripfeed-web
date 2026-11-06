import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import type { NewsItem } from '../../api/types'
import type { ItemListProps } from './ItemList'
import NewspaperStory from './NewspaperStory'
import TrailingRow from './TrailingRow'
import { newspaperRole } from './newspaperPresentation'
import { newspaperOwnership, ownedNewspaperItems, ownedNewspaperStacks } from './newspaperOwnership'
import useNewspaperMotion, {
  newspaperHeadlineBounds,
  type NewspaperMotionSnapshot,
} from './useNewspaperMotion'
import {
  newspaperColumnCount,
  newspaperModel,
  newspaperRange,
  storyAt,
  NEWSPAPER_EXPOSURE_STEP,
  NEWSPAPER_OVERSCAN,
  type NewspaperMeasurement,
  type NewspaperModel,
} from './newspaperVirtualization'

type Anchor = { id: number; column: number; index: number; offset: number }
type VisualAnchor = { id: number; offset: number; scroll: number }

function anchorAt(model: NewspaperModel, top: number): Anchor | null {
  if (model.lead && top < model.leadHeight) {
    return { id: model.lead.id, column: -1, index: 0, offset: top }
  }
  for (const [column, stack] of model.columns.entries()) {
    const index = storyAt(stack.offsets, top - model.leadHeight)
    const item = stack.items[index]
    if (item) {
      return {
        id: item.id,
        column,
        index,
        offset: top - model.leadHeight - stack.offsets[index],
      }
    }
  }
  return null
}

function anchorTop(model: NewspaperModel, anchor: Anchor): number {
  const found = model.locations.get(anchor.id)
  if (found) return found.top + anchor.offset
  const stack = model.columns[Math.max(0, Math.min(anchor.column, model.columns.length - 1))]
  return (
    model.leadHeight + stack.offsets[Math.min(anchor.index, stack.items.length)] + anchor.offset
  )
}

/** Independently measured story windows share a scroller, never a page-height
 * barrier. Unmounted stories contribute only column-local offset spacers. */
export default function NewspaperList({
  items,
  windowKey,
  motionSnapshot,
  active = true,
  selectedId,
  feedTitle,
  feedById,
  showFavicons = true,
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
}: ItemListProps & { motionSnapshot: MutableRefObject<NewspaperMotionSnapshot | null> }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const sentinelRef = useRef<HTMLLIElement>(null)
  const [geometry, setGeometry] = useState(() => ({
    width: 900,
    measurements: new Map<number, NewspaperMeasurement>(),
    measurementRevision: 0,
    top: 0,
    height: 0,
    target: selectedId,
  }))
  const columnCount = newspaperColumnCount(geometry.width)
  const [ownershipState, setOwnershipState] = useState(() => ({
    items,
    dataRevision: 0,
    ownership: newspaperOwnership(items, columnCount),
  }))
  let ownership = ownershipState.ownership
  let dataRevision = ownershipState.dataRevision
  if (ownershipState.items !== items || ownership.columns !== columnCount) {
    ownership = newspaperOwnership(items, columnCount, ownership)
    dataRevision++
    setOwnershipState({ items, ownership, dataRevision })
  }
  const orderedItems = useMemo(() => ownedNewspaperItems(items, ownership), [items, ownership])
  // Accessibility reports the current caller ranking, not tombstone slot numbers.
  const positions = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items])
  const selectedIndex =
    selectedId === null ? -1 : orderedItems.findIndex((item) => item.id === selectedId)
  const selectedCount =
    selectedIndex < 0
      ? 0
      : (Math.floor(selectedIndex / NEWSPAPER_EXPOSURE_STEP) + 1) * NEWSPAPER_EXPOSURE_STEP
  const [revealedCount, setRevealedCount] = useState(() =>
    Math.max(NEWSPAPER_EXPOSURE_STEP * 2, selectedCount),
  )
  // Exposure counts live stories, not vacant ownership slots.
  const representedCount = Math.max(revealedCount, selectedCount)
  useLayoutEffect(() => {
    if (selectedCount > revealedCount) setRevealedCount(selectedCount)
  }, [selectedCount, revealedCount])
  const hiddenLocal = items.length > representedCount
  const stacks = useMemo(
    () => ownedNewspaperStacks(orderedItems.slice(0, representedCount), ownership),
    [orderedItems, representedCount, ownership],
  )
  const model = useMemo(
    () => newspaperModel(stacks, geometry.width, geometry.measurements),
    [stacks, geometry.measurements, geometry.width],
  )
  const previousModel = useRef(model)
  const pendingAnchor = useRef<Anchor | null>(null)
  // Retain more than one visible headline so removing the first anchor can
  // preserve a surviving visible neighbour instead of a fractional page.
  const visualAnchors = useRef<VisualAnchor[]>([])
  const savedVisual = visualAnchors.current.find(
    (anchor) =>
      model.locations.has(anchor.id) &&
      Math.abs(anchor.scroll - (scrollRef.current?.scrollTop ?? 0)) < 1,
  )
  let rangeTop = geometry.top
  const targetLocation = geometry.target === null ? null : model.locations.get(geometry.target)
  if (targetLocation) rangeTop = targetLocation.top
  else if (previousModel.current !== model) {
    const anchor = pendingAnchor.current ?? anchorAt(previousModel.current, geometry.top)
    if (savedVisual) rangeTop = model.locations.get(savedVisual.id)!.top - savedVisual.offset
    else if (anchor) rangeTop = anchorTop(model, anchor)
  }
  const ranges = model.columns.map(({ offsets }) =>
    newspaperRange(offsets, rangeTop - model.leadHeight, geometry.height, columnCount),
  )
  const mountedWindow = ranges.map(({ first, last }) => `${first}:${last}`).join(',')
  const showLead = model.lead !== null && rangeTop <= model.leadHeight + NEWSPAPER_OVERSCAN
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

  // Hidden deep links jump straight to a bounded window, never mount a prefix.
  useLayoutEffect(() => {
    if (!active && selectedId !== null && returnTo.current?.id !== selectedId) {
      returnTo.current = { id: selectedId, scroll: null }
      setGeometry((old) => ({ ...old, target: selectedId }))
    }
  }, [active, selectedId])

  const refreshRef = useRef<() => void>(() => {})
  const scheduleRef = useRef<() => void>(() => {})
  const pendingRequest = useRef(false)
  // No-growth/filtered pages must not create an automatic cursor loop.
  const lastAutoWindow = useRef<string | null>(null)
  const tailApproach = useRef(false)
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
      setRevealedCount((old) => Math.max(old, representedCount) + NEWSPAPER_EXPOSURE_STEP)
    } else requestServer(manual)
  }

  const rememberVisualAnchor = useCallback(() => {
    const root = scrollRef.current
    if (!root) return
    const bounds = root.getBoundingClientRect()
    const headlines = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-story-id]') ?? []
    visualAnchors.current = [...headlines]
      .map((headline) => ({ headline, rect: newspaperHeadlineBounds(headline) }))
      .filter(({ rect }) => rect.bottom > bounds.top && rect.top < bounds.bottom)
      .sort((a, b) => a.rect.top - b.rect.top)
      .map(({ headline, rect }) => ({
        id: Number(headline.dataset.storyId),
        offset: rect.top - bounds.top,
        scroll: root.scrollTop,
      }))
  }, [])

  const measure = useCallback(() => {
    const root = scrollRef.current
    const list = listRef.current
    if (!active || !root || !list) return
    const width = list.clientWidth || Math.max(0, root.clientWidth - 80) || geometry.width
    let measurements = geometry.measurements
    for (const node of list.querySelectorAll<HTMLElement>('.newspaper-story')) {
      const id = Number(node.querySelector<HTMLElement>('[data-story-id]')!.dataset.storyId)
      const rect = node.getBoundingClientRect()
      const height = rect.height + (Number.parseFloat(getComputedStyle(node).marginBottom) || 0)
      const old = measurements.get(id)
      if (
        rect.width > 0 &&
        height > 0 &&
        (!old || Math.abs(old.width - rect.width) >= 1 || Math.abs(old.height - height) >= 1)
      ) {
        if (measurements === geometry.measurements) {
          // Only live represented IDs survive; offscreen visits retain heights,
          // never DOM, and a bulk clear cannot leave phantom placeholders.
          measurements = new Map([...measurements].filter(([id]) => model.locations.has(id)))
        }
        measurements.set(id, { width: rect.width, height })
      }
    }
    const top = Math.max(0, root.scrollTop - contentOrigin())
    if (measurements !== geometry.measurements || width !== geometry.width) {
      pendingAnchor.current = anchorAt(model, top)
      if (
        !visualAnchors.current.some(
          (saved) =>
            Math.abs(saved.scroll - root.scrollTop) < 1 &&
            list.querySelector(`[data-story-id="${saved.id}"]`),
        )
      ) {
        rememberVisualAnchor()
      }
    }
    if (
      measurements !== geometry.measurements ||
      width !== geometry.width ||
      top !== geometry.top ||
      root.clientHeight !== geometry.height ||
      geometry.target !== null
    ) {
      setGeometry({
        width,
        measurements,
        measurementRevision:
          geometry.measurementRevision +
          (measurements !== geometry.measurements || width !== geometry.width ? 1 : 0),
        top,
        height: root.clientHeight,
        target: null,
      })
    }
    if (measurements === geometry.measurements && width === geometry.width) rememberVisualAnchor()
  }, [active, geometry, model, contentOrigin, rememberVisualAnchor])

  refreshRef.current = () => {
    if (!enabled.current) return
    measure()
    const root = scrollRef.current
    if (!root || root.clientHeight <= 0) return
    const margin = Math.max(1200, root.clientHeight * 2)
    const top = root.scrollTop - contentOrigin()
    // A short stack must not wait for the longest stack to receive cached
    // successors. Server paging still requires the true overall tail.
    const near =
      top >= -margin &&
      (hiddenLocal
        ? model.columns.some(
            (column) =>
              column.items.length > 0 &&
              top + root.clientHeight + margin >= model.leadHeight + column.offsets.at(-1)!,
          )
        : top + root.clientHeight + margin >= model.height &&
          root.scrollHeight - root.scrollTop - root.clientHeight <= margin)
    // Keep the approach guard for local exposure too: an enormous viewport
    // or tiny repeated scrolls must not drain every cached page.
    if (!near) tailApproach.current = false
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
      root.scrollTop =
        saved?.scroll ?? ((saved ? model.locations.get(saved.id)?.top : 0) ?? 0) + contentOrigin()
      focusReturn.current = true
      pendingAnchor.current = null
      rememberVisualAnchor()
    } else if (previousModel.current !== model) {
      const visual = visualAnchors.current.find(
        (saved) =>
          Math.abs(saved.scroll - root.scrollTop) < 1 &&
          list.querySelector(`[data-story-id="${saved.id}"]`),
      )
      const headline = visual
        ? list.querySelector<HTMLButtonElement>(`[data-story-id="${visual.id}"]`)
        : null
      if (headline && visual) {
        root.scrollTop +=
          newspaperHeadlineBounds(headline).top - root.getBoundingClientRect().top - visual.offset
      } else {
        const anchor = pendingAnchor.current ?? anchorAt(previousModel.current, geometry.top)
        if (anchor) root.scrollTop = anchorTop(model, anchor) + contentOrigin()
      }
      pendingAnchor.current = null
    }
    previousModel.current = model
    measure()
    const width = list.clientWidth || Math.max(0, root.clientWidth - 80) || geometry.width
    if (focusReturn.current && width === geometry.width) {
      const saved = returnTo.current
      const story = saved
        ? list.querySelector<HTMLButtonElement>(`[data-story-id="${saved.id}"]`)
        : null
      if (!story && saved && model.locations.has(saved.id)) {
        setGeometry((old) => ({ ...old, target: saved.id }))
      } else {
        if (story && saved?.scroll === null) {
          root.scrollTop +=
            newspaperHeadlineBounds(story).top - root.getBoundingClientRect().top - contentOrigin()
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
    mountedWindow,
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
    if (listRef.current) observer?.observe(listRef.current)
    for (const node of listRef.current?.querySelectorAll('.newspaper-story') ?? [])
      observer?.observe(node)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      alive = false
      if (frame !== null) cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
      scheduleRef.current = () => {}
    }
  }, [active, mountedWindow, stacks])

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

  const renderStory = (item: NewsItem) => (
    <NewspaperStory
      key={item.id}
      item={item}
      index={positions.get(item.id)}
      total={items.length}
      role={newspaperRole(ownership.slots.get(item.id)!)}
      feedTitle={feedTitle}
      feedById={feedById}
      showFavicons={showFavicons}
      singleClickRead={singleClickRead}
      onSelect={selectStory}
      onRead={onRead}
      onStar={onStar}
    />
  )

  useNewspaperMotion(scrollRef, listRef, active, mountedWindow, {
    ready: geometry.height > 0,
    session: windowKey,
    columns: columnCount,
    dataRevision,
    measurementRevision: geometry.measurementRevision,
    snapshot: motionSnapshot,
  })

  return (
    <div
      ref={scrollRef}
      onScroll={() => {
        if (!enabled.current) return
        localApproach.current = true
        scheduleRef.current()
      }}
      className="newspaper-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-app-panel px-10 py-7 [overflow-anchor:none]"
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
        <li className="list-none" role="presentation">
          {showLead ? (
            <ul className="m-0 flow-root list-none p-0" aria-label="Lead story">
              {renderStory(model.lead!)}
            </ul>
          ) : (
            model.lead && (
              <div
                aria-hidden="true"
                data-newspaper-lead-placeholder
                style={{ height: model.leadHeight }}
              />
            )
          )}
          <div
            className="newspaper grid items-start gap-x-7"
            data-newspaper-count={Math.min(orderedItems.length, representedCount)}
            style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {model.columns.map((column, index) => {
              const range = ranges[index]
              return (
                <ul
                  key={index}
                  className="newspaper-column m-0 flow-root min-w-0 list-none p-0"
                  aria-label={`Column ${index + 1}`}
                >
                  <li
                    role="presentation"
                    aria-hidden="true"
                    data-newspaper-spacer="top"
                    style={{ height: column.offsets[range.first] }}
                  />
                  {column.items.slice(range.first, range.last + 1).map(renderStory)}
                  <li
                    role="presentation"
                    aria-hidden="true"
                    data-newspaper-spacer="bottom"
                    style={{ height: column.offsets.at(-1)! - column.offsets[range.last + 1] }}
                  />
                </ul>
              )
            })}
          </div>
        </li>
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
