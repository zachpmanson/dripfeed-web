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
      className={`feed-row mb-0.5 flex w-full items-center justify-between rounded-md bg-transparent px-2.5 py-1.5 text-left text-[0.85rem] text-app-text hover:bg-app-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${active ? 'active rounded-r-md rounded-l-none shadow-[inset_2px_0_0_var(--accent)]' : ''}`}
      onClick={onSelect}
      onContextMenu={(e) => onCtx(e, feed)}
    >
      <span className="feed-left flex min-w-0 items-center gap-2">
        {showFavicons && <FeedIcon feed={feed} size={14} />}
        <span className="feed-name truncate">{feed.title}</span>
      </span>
      {n > 0 && <span className="count">{n}</span>}
    </button>
  )
}
