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
      <div className="folder-head flex items-center">
        <button
          className={`folder-name-btn flex min-w-0 flex-1 items-center gap-2 rounded-md border-0 px-2.5 py-1.5 text-left text-sm text-app-muted hover:bg-app-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${selected ? 'active rounded-r-md rounded-l-none text-app-text shadow-[inset_2px_0_0_var(--accent)]' : ''}`}
          onClick={onSelectFolder}
        >
          <span className="folder-name min-w-0 flex-1 truncate">{folder.name}</span>
          {unread > 0 && <span className="count">{unread}</span>}
        </button>
        <span className="folder-right flex items-center">
          <button
            className="icon-btn caret-btn inline-flex size-8 items-center justify-center rounded border-0 p-0 text-app-muted hover:bg-app-border hover:text-app-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            title={collapsed ? 'Expand folder' : 'Collapse folder'}
            onClick={() => onToggle(folder.id)}
            aria-expanded={!collapsed}
          >
            <ChevronDownIcon
              className={`caret${collapsed ? ' collapsed' : ''}`}
              aria-hidden="true"
            />
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
