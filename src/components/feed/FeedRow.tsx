import { FeedContextMenu, type FeedMenuOptions } from './FeedContextMenu'
import type { NewsFeed } from '../../api/types'
import type { RarityInfo } from '../../rarity'
import { FeedIcon } from './FeedIcon'
import { sidebarItemClassName } from './sidebarItemStyle'

export default function FeedRow({
  feed,
  active,
  onSelect,
  menu,
  showFavicons,
  rarityInfo,
}: {
  feed: NewsFeed
  active: boolean
  onSelect: () => void
  menu: FeedMenuOptions
  showFavicons: boolean
  rarityInfo?: RarityInfo
}) {
  const n = feed.unreadCount
  const tooltip = rarityInfo
    ? `Average gap: ${rarityInfo.gap.toFixed(2)}h; multiplier: ${rarityInfo.mult.toPrecision(4)}`
    : 'Average gap: unavailable (fewer than 2 dated items); multiplier: 1 (neutral fallback)'
  return (
    <FeedContextMenu feed={feed} menu={menu}>
      <button
        data-feed-id={feed.id}
        title={tooltip}
        className={`feed-row ${sidebarItemClassName(active)}`}
        aria-current={active ? 'page' : undefined}
        onClick={onSelect}
      >
        <span className="feed-left flex min-w-0 items-center gap-2">
          {showFavicons && <FeedIcon feed={feed} size={14} />}
          <span className="feed-name truncate">{feed.title}</span>
        </span>
        {n > 0 && <span className="count">{n}</span>}
      </button>
    </FeedContextMenu>
  )
}
