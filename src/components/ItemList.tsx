import { useEffect, useRef } from 'react'
import type { NewsItem } from '../api/types'
import type { RarityInfo } from '../rarity'
import type { LoadMoreProgress } from '../store'

/**
 * Fallback title for untitled items: strip HTML from the body and take the
 * first sentence (or first ~80 chars). Shared by the list and the reader.
 */
export function titleFor(item: NewsItem): string {
  if (item.title && item.title.trim()) return item.title
  const doc = new DOMParser().parseFromString(item.body || '', 'text/html')
  const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
  if (!text) return '(untitled)'
  const m = text.match(/^[^.?!]*[.?!]/)
  const first = (m ? m[0] : text).trim()
  return first.length > 0 ? first : text.slice(0, 80)
}

interface Props {
  items: NewsItem[]
  selectedId: number | null
  feedTitle: (feedId: number) => string
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
  selectedId,
  feedTitle,
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
  // Auto-load-more: when the trailing row scrolls into view (a little
  // before the actual bottom), page the next batch — natural infinite scroll.
  const sentinelRef = useRef<HTMLLIElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore
  const more = moreServer && !drained
  const activeRef = useRef(more && !loadingMore)
  activeRef.current = more && !loadingMore

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !onLoadMoreRef.current) return
    const io = new IntersectionObserver(
      (entries) => {
        // Only auto-page when this view can still pull more and isn't
        // mid-fetch; otherwise (drained/loading) do nothing.
        if (entries[0]?.isIntersecting && activeRef.current) {
          onLoadMoreRef.current?.()
        }
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Order is owned by the caller (App applies newest or rarity); never
  // re-sort here or the toggle silently no-ops.
  return (
    <ul className="item-list">
      {items.map((item) => (
        <li
          key={item.id}
          className={`item ${item.id === selectedId ? 'selected' : ''} ${item.unread ? '' : 'read'}`}
          onClick={() => onSelect(item.id)}
          onDoubleClick={() => onRead(item)}
        >
          <div className="item-title">
            {item.unread && <span className="unread-dot" />}
            {titleFor(item)}
          </div>
          <div className="item-meta">
            <span className="feed">{feedTitle(item.feedId)}</span>
            {rarityMode ? (
              <span className="rarity-line" title="real age / effective age / rarity">
                {rarityLine(item, rarityStats)}
              </span>
            ) : (
              <span className="date muted">{formatDate(item.pubDate)}</span>
            )}
            {item.starred && <span aria-label="starred">★</span>}
          </div>
        </li>
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

function TrailingRow({
  sentinelRef,
  onLoadMore,
  moreServer,
  drained,
  loadingMore,
  paging,
}: {
  sentinelRef: React.RefObject<HTMLLIElement>
  onLoadMore?: () => void
  moreServer: boolean
  drained: boolean
  loadingMore: boolean
  paging?: LoadMoreProgress | null
}) {
  const more = moreServer && !drained
  const progress =
    paging && paging.totalFeeds > 0
      ? `paging feed ${Math.min(paging.feedsPaged, paging.totalFeeds)} of ${paging.totalFeeds}…`
      : null

  if (!more) {
    // Drained: the current view has no more server history to pull.
    return (
      <li ref={sentinelRef} className="load-more-row done">
        <span className="muted">— up to date —</span>
      </li>
    )
  }
  return (
    <li ref={sentinelRef} className="load-more-row">
      {loadingMore || progress ? (
        <span className="muted">{progress ?? 'loading…'}</span>
      ) : (
        <button className="load-more" onClick={onLoadMore}>
          load more
        </button>
      )}
    </li>
  )
}

function formatDate(ms: number | null): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

function rarityLine(item: NewsItem, stats?: Map<number, RarityInfo>, now = Date.now()): string {
  if (!item.pubDate) return '—'
  const info = stats?.get(item.feedId)
  // Unknown feed (no gap sample): dripfeed falls back to a 720h default gap.
  const gap = info?.gap ?? 720
  const mult =
    info?.mult ??
    Math.min(100, Math.max(0.0001, Math.pow(72 / Math.max(0.1, gap), 2.5)))
  const rarity = info?.rarity ?? gap / (gap + 72)
  const ageH = Math.max(0, (now - item.pubDate) / 3_600_000)
  return `${formatAge(ageH)} / ${formatAge(ageH * mult)} / ${Math.floor(rarity * 100)}%`
}

/** Dripfeed's formatAge: minutes under 1h, hours under 24h, days after. */
function formatAge(hours: number): string {
  if (hours < 1) return `${Math.trunc(hours * 60)}m`
  if (hours < 24) return `${Math.trunc(hours)}h`
  return `${Math.trunc(hours / 24)}d`
}