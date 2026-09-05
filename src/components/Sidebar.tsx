import type { NewsFolder, NewsFeed, NewsItem } from '../api/types'
import { unreadCount } from '../store'

export type View =
  | { kind: 'unread' }
  | { kind: 'starred' }
  | { kind: 'feed'; id: number }

interface Props {
  feeds: Map<number, NewsFeed>
  folders: NewsFolder[]
  items: Map<number, NewsItem>
  view: View
  onSelect: (v: View) => void
}

export function Sidebar({ feeds, folders, items, view, onSelect }: Props) {
  const totalUnread = unreadCount(items)
  const totalStarred = [...items.values()].filter((i) => i.starred).length
  const feedEntries = [...feeds.values()].sort((a, b) => a.title.localeCompare(b.title))
  const ungrouped = feedEntries.filter((f) => f.folderId === null)

  return (
    <nav className="sidebar">
      <div className="sidebar-scroll">
        <button
          className={view.kind === 'unread' ? 'active' : ''}
          onClick={() => onSelect({ kind: 'unread' })}
        >
          <span>Unread</span>
          <span className="count">{totalUnread}</span>
        </button>
        <button
          className={view.kind === 'starred' ? 'active' : ''}
          onClick={() => onSelect({ kind: 'starred' })}
        >
          <span>Starred</span>
          <span className="count">{totalStarred}</span>
        </button>

        {folders.map((folder) => {
          const inFolder = feedEntries.filter((f) => f.folderId === folder.id)
          if (inFolder.length === 0) return null
          return (
            <div key={folder.id} className="folder">
              <div className="folder-name">{folder.name}</div>
              {inFolder.map((f) => (
                <FeedRow key={f.id} feed={f} items={items} view={view} onSelect={onSelect} />
              ))}
            </div>
          )
        })}

        {ungrouped.length > 0 && (
          <div className="folder">
            <div className="folder-name">Feeds</div>
            {ungrouped.map((f) => (
              <FeedRow key={f.id} feed={f} items={items} view={view} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}

function FeedRow({
  feed,
  items,
  view,
  onSelect,
}: {
  feed: NewsFeed
  items: Map<number, NewsItem>
  view: View
  onSelect: (v: View) => void
}) {
  const n = unreadCount(items, feed.id)
  return (
    <button
      className={
        view.kind === 'feed' && view.id === feed.id ? 'active feed-row' : 'feed-row'
      }
      onClick={() => onSelect({ kind: 'feed', id: feed.id })}
    >
      <span className="feed-name">{feed.title}</span>
      {n > 0 && <span className="count">{n}</span>}
    </button>
  )
}