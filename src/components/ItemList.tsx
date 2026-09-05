import type { NewsItem } from '../api/types'
import type { RarityInfo } from '../rarity'

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
  moreAvailable?: boolean
  loadingMore?: boolean
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
  moreAvailable = false,
  loadingMore = false,
}: Props) {
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
            {item.title || '(untitled)'}
          </div>
          <div className="item-meta">
            <span className="feed">{feedTitle(item.feedId)}</span>
            {rarityMode ? (
              <span className="rarity-line" title="real age / effective age / rarity">
                {rarityLine(item, rarityStats)}
              </span>
            ) : (
              <span className="muted">{formatDate(item.pubDate)}</span>
            )}
            {item.starred && <span aria-label="starred">★</span>}
          </div>
        </li>
      ))}
      {items.length === 0 && <li className="muted">{emptyText}</li>}
      {onLoadMore && moreAvailable && (
        <li className="load-more-row">
          <button className="load-more" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'loading…' : 'load more'}
          </button>
        </li>
      )}
    </ul>
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