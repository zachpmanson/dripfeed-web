import { type FeedMenuOptions } from './FeedContextMenu'
import { Collapsible } from '@base-ui/react/collapsible'
import { IconChevronDown } from '@tabler/icons-react'
import type { NewsFeed, NewsFolder } from '../../api/types'
import type { RarityInfo } from '../../rarity'
import FeedRow from './FeedRow'
import { sidebarItemClassName } from './sidebarItemStyle'

export default function FolderSection({
  folder,
  feeds,
  selected,
  selectedFeedId,
  collapsed,
  onSelectFolder,
  onSelectFeed,
  onToggle,
  menu,
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
  menu: FeedMenuOptions
  showFavicons: boolean
  rarityStats: Map<number, RarityInfo>
}) {
  const unread = feeds.reduce((total, feed) => total + feed.unreadCount, 0)

  return (
    <Collapsible.Root className="folder" open={!collapsed} onOpenChange={() => onToggle(folder.id)}>
      <div className="folder-head flex items-center">
        <button
          className={`folder-name-btn ${sidebarItemClassName(selected, selected ? 'text-app-text' : 'text-app-muted', 'min-w-0 flex-1 gap-2')}`}
          aria-current={selected ? 'page' : undefined}
          onClick={onSelectFolder}
        >
          <span className="folder-name min-w-0 flex-1 truncate">{folder.name}</span>
          {unread > 0 && <span className="count">{unread}</span>}
        </button>
        <span className="folder-right flex items-center">
          <Collapsible.Trigger
            className="icon-btn caret-btn inline-flex size-8 items-center justify-center rounded border-0 p-0 text-app-muted hover:bg-app-border hover:text-app-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            title={collapsed ? 'Expand folder' : 'Collapse folder'}
          >
            <IconChevronDown
              className={`caret${collapsed ? ' collapsed' : ''}`}
              aria-hidden="true"
            />
          </Collapsible.Trigger>
        </span>
      </div>
      <Collapsible.Panel>
        {feeds.map((feed) => (
          <FeedRow
            key={feed.id}
            feed={feed}
            active={selectedFeedId === feed.id}
            onSelect={() => onSelectFeed(feed.id)}
            menu={menu}
            showFavicons={showFavicons}
            rarityInfo={rarityStats.get(feed.id)}
          />
        ))}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
