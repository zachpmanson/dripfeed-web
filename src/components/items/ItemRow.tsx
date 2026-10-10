import { StarIcon } from '@heroicons/react/24/solid'
import type { NewsItem, NewsFeed } from '../../api/types'
import type { RarityInfo } from '../../rarity'
import { FeedIcon } from '../feed/FeedIcon'
import { titleFor } from '../../utils'

export default function ItemRow({
  item,
  selected,
  feedTitle,
  feedById,
  showFavicons,
  singleClickRead,
  onSelect,
  onRead,
  rarityMode,
  rarityStats,
}: {
  item: NewsItem
  selected: boolean
  feedTitle: (feedId: number) => string
  feedById?: (feedId: number) => NewsFeed | undefined
  showFavicons: boolean
  singleClickRead: boolean
  onSelect: (id: number) => void
  onRead: (item: NewsItem) => void
  rarityMode: boolean
  rarityStats?: Map<number, RarityInfo>
}) {
  return (
    <li
      className={`item ${selected ? 'selected' : ''} ${item.unread ? '' : 'read'}`}
      onClick={() => {
        onSelect(item.id)
        // Single-click read mode flips unread → read only; selecting an
        // already-read item must not mark it unread again.
        if (singleClickRead && item.unread) onRead(item)
      }}
      onDoubleClick={() => {
        if (!singleClickRead) onRead(item)
      }}
    >
      <div className="item-title">
        {item.unread && <span className="unread-dot" />}
        {titleFor(item)}
      </div>
      <div className="item-meta">
        {showFavicons &&
          feedById &&
          (() => {
            const feed = feedById(item.feedId)
            return feed ? <FeedIcon feed={feed} size={12} /> : null
          })()}
        <span className="feed">{feedTitle(item.feedId)}</span>
        {rarityMode ? (
          <span className="rarity-line" title="real age / effective age / rarity">
            {rarityLine(item, rarityStats)}
          </span>
        ) : (
          <span className="date muted">{formatDate(item.pubDate)}</span>
        )}
        {item.starred && (
          <span aria-label="starred">
            <StarIcon className="list-star-icon" aria-hidden="true" />
          </span>
        )}
      </div>
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
  const mult = info?.mult ?? Math.min(100, Math.max(0.0001, Math.pow(72 / Math.max(0.1, gap), 2.5)))
  const rarity = info?.rarity ?? gap / (gap + 72)
  const ageH = Math.max(0, (now - item.pubDate) / 3_600_000)
  return `${formatAge(ageH)} / ${formatAge(ageH * mult)} / ${Math.floor(rarity * 100)}%`
}

function formatAge(hours: number): string {
  const seconds = Math.floor(hours * 3600)
  if (seconds < 60) return `${Math.max(1, seconds)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}y`
}
