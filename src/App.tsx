import { useEffect, useRef, useState } from 'react'
import { useStore } from './hooks'
import { loadSettings } from './settings'
import type { Settings } from './settings'
import { SettingsForm } from './components/SettingsForm'
import { Sidebar, type View } from './components/Sidebar'
import { ItemList } from './components/ItemList'
import { ItemView } from './components/ItemView'
import { AddModal } from './components/AddModal'
import { SettingsModal } from './components/SettingsModal'
import {
  applyUiTheme,
  articleThemeKey,
  effectiveTheme,
  loadShowFavicons,
  loadThemeSetting,
  saveShowFavicons,
  saveThemeSetting,
  uiThemeKey,
  type ThemeSetting,
} from './theme'
import { rarityMultipliers, rarityStats, sortByRarity } from './rarity'
import type { NewsItem } from './api/types'

type SortMode = 'newest' | 'rarity'

const SORT_KEY = 'dripfeed.sort'
const SHOW_ALL_KEY = 'dripfeed.showAll'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(loadSettings)
  const [view, setView] = useState<View>({ kind: 'all' })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const stored = localStorage.getItem(SORT_KEY)
    return stored === 'newest' ? 'newest' : 'rarity'
  })
  const [showAll, setShowAll] = useState<boolean>(() => localStorage.getItem(SHOW_ALL_KEY) === '1')

  useEffect(() => {
    localStorage.setItem(SORT_KEY, sortMode)
  }, [sortMode])

  useEffect(() => {
    localStorage.setItem(SHOW_ALL_KEY, showAll ? '1' : '0')
  }, [showAll])

  const store = useStore(settings, view)
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // --- theme (UI + article, each light/dark/system) ---
  const [uiTheme, setUiThemeState] = useState<ThemeSetting>(() =>
    loadThemeSetting(uiThemeKey),
  )
  const [articleTheme, setArticleThemeState] = useState<ThemeSetting>(() =>
    loadThemeSetting(articleThemeKey),
  )
  const [showFavicons, setShowFaviconsState] = useState<boolean>(loadShowFavicons)

  useEffect(() => {
    applyUiTheme(uiTheme)
    if (uiTheme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyUiTheme(uiTheme)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [uiTheme])

  const setUiTheme = (v: ThemeSetting) => {
    setUiThemeState(v)
    saveThemeSetting(uiThemeKey, v)
  }
  const setArticleTheme = (v: ThemeSetting) => {
    setArticleThemeState(v)
    saveThemeSetting(articleThemeKey, v)
  }
  const setShowFavicons = (v: boolean) => {
    setShowFaviconsState(v)
    saveShowFavicons(v)
  }
  const articleDark = effectiveTheme(articleTheme) === 'dark'

  // On navigation to an individual feed: top the local window up to 20 and
  // probe the server for whether more history exists (so a short/partial
  // feed auto-fills and the load-more button reflects reality). In-flight
  // guard so StrictMode's double effect fires at most one probe/refill.
  const ensureRef = useRef<Promise<void> | null>(null)
  useEffect(() => {
    if (view.kind !== 'feed' || !settings) return
    if (ensureRef.current) return
    ensureRef.current = store.actions.ensureFeed(view.id).finally(() => {
      ensureRef.current = null
    })
  }, [view, settings, store.actions])

  if (!settings) {
    return (
      <SettingsForm
        initial={null}
        onSave={(s) => {
          setSettings(s)
        }}
      />
    )
  }

  if (!store.ready) {
    return (
      <div className="sync-gate">
        <div className="sync-card">
          <h1>Dripfeed</h1>
          {store.error ? (
            <div className="error">{store.error}</div>
          ) : store.progress ? (
            <>
              <p className="muted">
                syncing… {store.progress.done.toLocaleString()} items
              </p>
              <div className="progress indeterminate">
                <div className="progress-bar" />
              </div>
            </>
          ) : (
            <p className="muted">connecting…</p>
          )}
          <button onClick={() => store.actions.reset()}>start over</button>
        </div>
      </div>
    )
  }

  const { pool, feeds, folders, loadingMore, paging, cursors } = store

  // folder id -> set of member feed ids (items only know feedId)
  const feedOfFolder = new Map<number, Set<number>>()
  for (const f of feeds.values()) {
    if (f.folderId === null) continue
    let s = feedOfFolder.get(f.folderId)
    if (!s) feedOfFolder.set(f.folderId, (s = new Set()))
    s.add(f.id)
  }

  // Cursor-aware "server has more" derived PER VIEW: feed view → that
  // feed's cursor; folder view → any member feed's cursor; all/unread/
  // starred → any feed with a live cursor. A feed with no cursor yet
  // (window still unseeded) is treated as having more.
  let scopeIds: Iterable<number>
  if (view.kind === 'feed') scopeIds = [view.id]
  else if (view.kind === 'folder') scopeIds = feedOfFolder.get(view.id) ?? []
  else scopeIds = cursors.keys()
  const scope = [...scopeIds]
  const liveCount = scope.filter((fid) => (cursors.get(fid) ?? -1) >= 0).length
  const moreServer = liveCount > 0
  // Drained = the view's feeds are all paged to the server end (or the
  // view has no feeds of its own to page, e.g. an empty folder).
  const drained = scope.length === 0 || liveCount === 0

  // Filter + rank the WHOLE pool, then slice for display. Rarity/selected
  // operate over the full pool (rarity's 20-item feed sample is stable
  // regardless of how much history load-more has pulled in).
  const rarMult = sortMode === 'rarity' ? rarityMultipliers(pool) : undefined
  const rarStats = sortMode === 'rarity' ? rarityStats(pool) : undefined
  const visibleItems = filterView(pool, view, sortMode, showAll, rarMult, feedOfFolder)

  const feedTitle = (feedId: number) => feeds.get(feedId)?.title ?? `feed ${feedId}`
  const feedById = (feedId: number) => feeds.get(feedId)
  // Selection: prefer the id in the CURRENT view; if the item dropped out of
  // the filter (e.g. marked read in the unread view) fall back to the same
  // id in the full pool so the reader stays on it. Only when the item is
  // gone entirely do we jump to the first visible item.
  const selected =
    (selectedId !== null &&
      (visibleItems.find((i) => i.id === selectedId) ?? pool.find((i) => i.id === selectedId))) ||
    visibleItems[0] ||
    null

  return (
    <div className="app">
      <header className="app-header">
        <h1>Dripfeed</h1>
        <div className="header-right">
          <div className="seg" title="items shown: all, or only unread">
            <button className={!showAll ? 'active' : ''} onClick={() => setShowAll(false)}>
              only unread
            </button>
            <button className={showAll ? 'active' : ''} onClick={() => setShowAll(true)}>
              all
            </button>
          </div>
          <div className="seg">
            <button className={sortMode === 'newest' ? 'active' : ''} onClick={() => setSortMode('newest')}>
              newest
            </button>
            <button
              className={sortMode === 'rarity' ? 'active' : ''}
              onClick={() => setSortMode('rarity')}
              title="weighted rarity: rare feeds first"
            >
              rarity
            </button>
          </div>
          <span className="muted sync">{pool.length} local</span>
          <button
            className="add-btn"
            title="add feed or folder"
            onClick={() => setShowAdd(true)}
          >
            +
          </button>
          <button
            className="add-btn"
            title="settings"
            aria-label="settings"
            onClick={() => setShowSettings(true)}
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="app-body">
        {store.error && <div className="error">{store.error}</div>}
        <Sidebar
          feeds={feeds}
          folders={folders}
          items={pool}
          view={view}
          settings={settings}
          showFavicons={showFavicons}
          onMetaChanged={() => void store.actions.refreshMeta()}
          onSelect={(v) => {
            setView(v)
            setSelectedId(null)
          }}
        />
        <div className="list-pane">
          <ItemList
            items={visibleItems}
            selectedId={selected?.id ?? null}
            feedTitle={feedTitle}
            feedById={feedById}
            showFavicons={showFavicons}
            onSelect={setSelectedId}
            onRead={(item: NewsItem) => {
              void store.actions.setRead(item, !item.unread)
            }}
            rarityMode={sortMode === 'rarity'}
            rarityStats={rarStats}
            emptyText={showAll ? 'No items here.' : 'No unread items. Nothing dripping?'}
            onLoadMore={store.loadMore}
            moreServer={moreServer}
            drained={drained}
            loadingMore={loadingMore}
            paging={paging}
          />
        </div>
        <ItemView
          item={selected}
          feedTitle={feedTitle}
          actions={store.actions}
          articleDark={articleDark}
        />
      </main>
      {showAdd && settings && (
        <AddModal
          folders={folders}
          settings={settings}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            // refresh feeds/folders meta so the new item shows in the sidebar
            void store.actions.refreshMeta()
          }}
        />
      )}
      {showSettings && (
        <SettingsModal
          uiTheme={uiTheme}
          articleTheme={articleTheme}
          showFavicons={showFavicons}
          onUiTheme={setUiTheme}
          onArticleTheme={setArticleTheme}
          onShowFavicons={setShowFavicons}
          onLogout={() => {
            void store.actions.reset()
            setSettings(null)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

function filterView(
  items: NewsItem[],
  view: View,
  sortMode: SortMode,
  showAll: boolean,
  rarMult?: Map<number, number>,
  feedOfFolder?: Map<number, Set<number>>,
): NewsItem[] {
  let list: NewsItem[]
  switch (view.kind) {
    case 'all':
      // Fixed: ALL items, global toggle has no effect here.
      list = items
      break
    case 'allUnread':
      // Fixed: unread only, global toggle has no effect here.
      list = items.filter((i) => i.unread)
      break
    case 'starred':
      list = items.filter((i) => i.starred && (showAll || i.unread))
      break
    case 'feed':
    case 'folder':
      // B: browsing a feed (or a folder's combined feed) is about reading
      // old posts — always show all items, ignore the global toggle.
      list = items.filter((i) => {
        if (view.kind === 'feed') return i.feedId === view.id
        // folder: item belongs if its feed is a member of the folder
        const memberFeeds = feedOfFolder?.get(view.id)
        return !!memberFeeds && memberFeeds.has(i.feedId)
      })
      break
  }
  // Feed/folder views stay newest-first (rarity is a cross-feed view).
  if (view.kind === 'feed' || view.kind === 'folder') {
    return list.sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
  }
  if (sortMode === 'rarity') {
    // Multipliers over the full pool, not the visible slice.
    return sortByRarity(list, rarMult)
  }
  return list.sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
}