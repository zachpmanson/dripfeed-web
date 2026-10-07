import type { NewsFeed } from '../../api/types'
import type { RarityInfo } from '../../rarity'
import { FeedIcon } from './FeedIcon'

export default function FeedRow({
  feed,
  active,
  onSelect,
  onCtx,
  showFavicons,
  rarityInfo,
}: {
  feed: NewsFeed
  active: boolean
  onSelect: () => void
  onCtx: (e: React.MouseEvent, feed: NewsFeed) => void
  showFavicons: boolean
  rarityInfo?: RarityInfo
}) {
  const n = feed.unreadCount
  const tooltip = rarityInfo
    ? `Average gap: ${rarityInfo.gap.toFixed(2)}h; multiplier: ${rarityInfo.mult.toPrecision(4)}`
    : 'Average gap: unavailable (fewer than 2 dated items); multiplier: 1 (neutral fallback)'
  return (
    <button
      data-feed-id={feed.id}
      title={tooltip}
      className={active ? 'active feed-row' : 'feed-row'}
      onClick={onSelect}
      onContextMenu={(e) => onCtx(e, feed)}
    >
      <span className="feed-left">
        {showFavicons && <FeedIcon feed={feed} size={14} />}
        <span className="feed-name">{feed.title}</span>
      </span>
      {n > 0 && <span className="count">{n}</span>}
    </button>
  )
}
