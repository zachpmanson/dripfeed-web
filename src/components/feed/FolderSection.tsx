import { ChevronDownIcon } from '@heroicons/react/24/outline'
import type { NewsFeed, NewsFolder } from '../../api/types'
import type { RarityInfo } from '../../rarity'
import FeedRow from './FeedRow'

export default function FolderSection({
  folder,
  feeds,
  selected,
  selectedFeedId,
  collapsed,
  onSelectFolder,
  onSelectFeed,
  onToggle,
  onCtx,
  showFavicons,
  rarityStats,
}: {
  folder: NewsFolder
  feeds: NewsFeed[]
  selected: boolean
  selectedFeedId: number | null
  collapsed: boolean
  onSelectFolder: () => void
  onSelectFeed: (feedId: number) => void
  onToggle: (folderId: number) => void
  onCtx: (e: React.MouseEvent, feed: NewsFeed) => void
  showFavicons: boolean
  rarityStats: Map<number, RarityInfo>
}) {
  const unread = feeds.reduce((total, feed) => total + feed.unreadCount, 0)

  return (
    <div className="folder">
      <div className="folder-head">
        <button
          className={`folder-name-btn${selected ? ' active' : ''}`}
          onClick={onSelectFolder}
        >
          <span className="folder-name">{folder.name}</span>
          {unread > 0 && <span className="count">{unread}</span>}
        </button>
        <span className="folder-right">
          <button
            className="icon-btn caret-btn"
            title={collapsed ? 'Expand folder' : 'Collapse folder'}
            onClick={() => onToggle(folder.id)}
            aria-expanded={!collapsed}
          >
            <ChevronDownIcon className={`caret${collapsed ? ' collapsed' : ''}`} aria-hidden="true" />
          </button>
        </span>
      </div>
      {!collapsed &&
        feeds.map((feed) => (
          <FeedRow
            key={feed.id}
            feed={feed}
            active={selectedFeedId === feed.id}
            onSelect={() => onSelectFeed(feed.id)}
            onCtx={onCtx}
            showFavicons={showFavicons}
            rarityInfo={rarityStats.get(feed.id)}
          />
        ))}
    </div>
  )
}
