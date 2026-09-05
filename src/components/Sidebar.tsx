import { useState } from 'react'
import type { NewsFolder, NewsFeed, NewsItem } from '../api/types'
import { unreadCount, starredCount } from '../selectors'

export type View =
  | { kind: 'all' } // ALL items, ignores the only-unread/all toggle
  | { kind: 'allUnread' } // unread only, ignores the only-unread/all toggle
  | { kind: 'starred' }
  | { kind: 'folder'; id: number } // combined feed of a folder's feeds
  | { kind: 'feed'; id: number }

interface Props {
  feeds: Map<number, NewsFeed>
  folders: NewsFolder[]
  items: NewsItem[]
  view: View
  onSelect: (v: View) => void
}

const COLLAPSE_KEY = 'dripfeed.folders.collapsed'

export function Sidebar({ feeds, folders, items, view, onSelect }: Props) {
  const totalUnread = unreadCount(items)
  const totalStarred = starredCount(items)
  const feedEntries = [...feeds.values()].sort((a, b) => a.title.localeCompare(b.title))

  // Sorted by folder NAME, then ungrouped ("Feeds") always last.
  const sortedFolders = [...folders]
    .filter((f) => feedEntries.some((fe) => fe.folderId === f.id))
    .sort((a, b) => a.name.localeCompare(b.name))
  const ungrouped = feedEntries.filter((f) => f.folderId === null)

  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY)
      return raw ? new Set(JSON.parse(raw) as number[]) : new Set()
    } catch {
      return new Set()
    }
  })

  const fold = (ids: Iterable<number>, into: Set<number>) => {
    for (const id of ids) into.add(id)
    return into
  }
  const applyCollapsed = (next: Set<number>) => {
    setCollapsed(next)
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]))
  }
  const toggle = (id: number) => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    applyCollapsed(next)
  }
  const allCollapsed =
    sortedFolders.length > 0 && sortedFolders.every((f) => collapsed.has(f.id))

  return (
    <nav className="sidebar">
      <div className="sidebar-toolbar">
        <span className="muted">folders</span>
        <div className="sidebar-actions">
          <button
            className="icon-btn"
            title={allCollapsed ? 'Expand all folders' : 'Collapse all folders'}
            onClick={() => {
              if (allCollapsed) applyCollapsed(new Set())
              else applyCollapsed(fold(sortedFolders.map((f) => f.id), new Set()))
            }}
            aria-label={allCollapsed ? 'expand all' : 'collapse all'}
          >
            {allCollapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>
      <div className="sidebar-scroll">
        <button
          className={view.kind === 'all' ? 'active' : ''}
          onClick={() => onSelect({ kind: 'all' })}
        >
          <span>All items</span>
          <span className="count">{totalUnread}</span>
        </button>
        <button
          className={view.kind === 'allUnread' ? 'active' : ''}
          onClick={() => onSelect({ kind: 'allUnread' })}
        >
          <span>All unread</span>
          <span className="count">{totalUnread}</span>
        </button>
        <button
          className={view.kind === 'starred' ? 'active' : ''}
          onClick={() => onSelect({ kind: 'starred' })}
        >
          <span>Starred</span>
          <span className="count">{totalStarred}</span>
        </button>

        {sortedFolders.map((folder) => {
          const inFolder = feedEntries.filter((f) => f.folderId === folder.id)
          const isCollapsed = collapsed.has(folder.id)
          const folderUnread = inFolder.reduce((s, f) => s + unreadCount(items, f.id), 0)
          return (
            <div key={folder.id} className="folder">
              <div className="folder-head">
                <button
                  className={`folder-name-btn${view.kind === 'folder' && view.id === folder.id ? ' active' : ''}`}
                  onClick={() => onSelect({ kind: 'folder', id: folder.id })}
                >
                  <span className="folder-name">{folder.name}</span>
                </button>
                <span className="folder-right">
                  {folderUnread > 0 && <span className="count">{folderUnread}</span>}
                  <button
                    className="icon-btn caret-btn"
                    title={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                    onClick={() => toggle(folder.id)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className={`caret${isCollapsed ? ' collapsed' : ''}`}>▾</span>
                  </button>
                </span>
              </div>
              {!isCollapsed &&
                inFolder.map((f) => (
                  <FeedRow key={f.id} feed={f} items={items} view={view} onSelect={onSelect} />
                ))}
            </div>
          )
        })}

        {ungrouped.length > 0 && (
          <div className="folder">
            <div className="folder-head-static">
              <span className="folder-name no-caret">Feeds</span>
            </div>
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
  items: NewsItem[]
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