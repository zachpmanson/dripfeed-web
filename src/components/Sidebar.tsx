import { useEffect, useRef, useState } from 'react'
import type { NewsFolder, NewsFeed, NewsItem } from '../api/types'
import { unreadCount, starredCount } from '../selectors'
import { FeedContextMenu } from './FeedContextMenu'
import { FeedIcon } from './FeedIcon'
import type { Settings } from '../settings'

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
  settings: Settings
  showFavicons: boolean
  onMetaChanged: () => void
  /** A feed to reveal in the sidebar: expand its folder (if any) and scroll
   *  it into view. `nonce` is bumped on each request so repeat clicks on the
   *  same feed retrigger the reveal. */
  revealFeed?: { id: number; nonce: number } | null
}

const COLLAPSE_KEY = 'dripfeed.folders.collapsed'

export function Sidebar({ feeds, folders, items, view, onSelect, settings, showFavicons, onMetaChanged, revealFeed }: Props) {
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

  const [ctx, setCtx] = useState<{ feed: NewsFeed; x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Reveal a feed the reader's header jumped to: expand its folder if it's
  // collapsed, then scroll the feed row into view. Expansion is state set
  // just below, so defer the scroll a beat for the re-render to lay out.
  useEffect(() => {
    if (!revealFeed) return
    let cancelled = false
    const feed = revealFeed.id != null ? feeds.get(revealFeed.id) : null
    if (feed && feed.folderId !== null && collapsed.has(feed.folderId)) {
      const next = new Set(collapsed)
      next.delete(feed.folderId)
      applyCollapsed(next)
    }
    window.setTimeout(() => {
      if (cancelled) return
      const row = scrollRef.current?.querySelector(`[data-feed-id="${revealFeed.id}"]`)
      ;(row as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 60)
    return () => {
      cancelled = true
    }
  }, [revealFeed?.nonce])

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

  const onCtx = (e: React.MouseEvent, feed: NewsFeed) => {
    e.preventDefault()
    setCtx({ feed, x: e.clientX, y: e.clientY })
  }

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
            <span className={`caret${allCollapsed ? ' collapsed' : ''}`} />
          </button>
        </div>
      </div>
      <div className="sidebar-scroll" ref={scrollRef}>
        <button
          className={view.kind === 'all' ? 'active' : ''}
          onClick={() => onSelect({ kind: 'all' })}
        >
          <span>All items</span>
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
                  {folderUnread > 0 && <span className="count">{folderUnread}</span>}
                </button>
                <span className="folder-right">
                  <button
                    className="icon-btn caret-btn"
                    title={isCollapsed ? 'Expand folder' : 'Collapse folder'}
                    onClick={() => toggle(folder.id)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className={`caret${isCollapsed ? ' collapsed' : ''}`} />
                  </button>
                </span>
              </div>
              {!isCollapsed &&
                inFolder.map((f) => (
                  <FeedRow key={f.id} feed={f} items={items} view={view} onSelect={onSelect} onCtx={onCtx} showFavicons={showFavicons} />
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
              <FeedRow key={f.id} feed={f} items={items} view={view} onSelect={onSelect} onCtx={onCtx} showFavicons={showFavicons} />
            ))}
          </div>
        )}
      </div>
      {ctx && settings && (
        <FeedContextMenu
          feed={ctx.feed}
          folders={folders}
          settings={settings}
          x={ctx.x}
          y={ctx.y}
          unread={unreadCount(items, ctx.feed.id)}
          onClose={() => setCtx(null)}
          onChanged={onMetaChanged}
        />
      )}
    </nav>
  )
}

function FeedRow({
  feed,
  items,
  view,
  onSelect,
  onCtx,
  showFavicons,
}: {
  feed: NewsFeed
  items: NewsItem[]
  view: View
  onSelect: (v: View) => void
  onCtx: (e: React.MouseEvent, feed: NewsFeed) => void
  showFavicons: boolean
}) {
  const n = unreadCount(items, feed.id)
  return (
    <button
      data-feed-id={feed.id}
      className={
        view.kind === 'feed' && view.id === feed.id ? 'active feed-row' : 'feed-row'
      }
      onClick={() => onSelect({ kind: 'feed', id: feed.id })}
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