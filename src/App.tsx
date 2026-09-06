import { useEffect, useRef, useState } from 'react'
import { useStore } from './hooks'
import { unreadScopeKey } from './store'
import { loadSettings } from './settings'
import type { Settings } from './settings'
import { SettingsForm } from './components/SettingsForm'
import { Sidebar, type View } from './components/Sidebar'
import { ItemList } from './components/ItemList'
import { ItemView } from './components/ItemView'
import { AddModal } from './components/AddModal'
import { SettingsModal } from './components/SettingsModal'
import { Seg } from './components/Seg'
import { IconButton } from './components/IconButton'
import {
  applyUiTheme,
  articleThemeKey,
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
  const [view, setView] = useState<View>(() => viewFromUrl())
  const [selectedId, setSelectedId] = useState<number | null>(() => itemIdFromUrl())
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const stored = localStorage.getItem(SORT_KEY)
    return stored === 'newest' ? 'newest' : 'rarity'
  })
  const [showAll, setShowAll] = useState<boolean>(() => localStorage.getItem(SHOW_ALL_KEY) === '1')

  // Restore the open view + selected item on reload: keep the URL in sync as
  // the user navigates so a refresh returns to the same place.
  useEffect(() => {
    writeViewToUrl(view)
  }, [view])
  useEffect(() => {
    writeItemIdToUrl(selectedId)
  }, [selectedId])

  useEffect(() => {
    localStorage.setItem(SORT_KEY, sortMode)
  }, [sortMode])

  useEffect(() => {
    localStorage.setItem(SHOW_ALL_KEY, showAll ? '1' : '0')
  }, [showAll])

  const store = useStore(settings, view, !showAll)
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Credentials rejected (401): the store already wiped localStorage/IDB;
  // drop back to the settings form so the user can re-enter them.
  useEffect(() => {
    if (store.authFailed) setSettings(null)
  }, [store.authFailed])

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

  // On navigation to an individual feed: top the local window up to 20 and
  // probe the server for whether more history exists (so a short/partial
  // feed auto-fills and the load-more button reflects reality). In-flight
  // guard so StrictMode's double effect fires at most one probe/refill.
  const ensureRef = useRef<Promise<void> | null>(null)
  const unreadEnsureRef = useRef<Promise<void> | null>(null)
  useEffect(() => {
    if (view.kind !== 'feed' || !settings) return
    // In unread-only mode the native unread query below supersedes the
    // window top-up for THIS visit; the window/cursor probe still runs so
    // toggling to "all" pages instantly.
    if (ensureRef.current) return
    ensureRef.current = store.actions.ensureFeed(view.id).finally(() => {
      ensureRef.current = null
    })
  }, [view, settings, store.actions])

  // Unread-only mode: feed/folder views pull their WHOLE unread set via the
  // native unread query (getRead=false, batchSize=-1 → one no-limit server
  // request) instead of walking history pages looking for unread items. If
  // the query returns nothing we know the scope genuinely has no unread
  // items — no fruitless deep pagination — and the scope is marked drained.
  useEffect(() => {
    if (!settings) return
    if (showAll) return
    if (view.kind !== 'feed' && view.kind !== 'folder') return
    const type = view.kind === 'feed' ? 0 : 1
    if (store.unreadDrained.has(unreadScopeKey(type, view.id))) return
    if (unreadEnsureRef.current) return
    unreadEnsureRef.current = store.actions
      .ensureUnread(type, view.id)
      .then(() => undefined)
      .catch((e) => console.warn('unread probe failed', e))
      .finally(() => {
        unreadEnsureRef.current = null
      })
  }, [view, settings, showAll, store.actions, store.unreadDrained])

  if (!settings) {
    return (
      <SettingsForm
        initial={null}
        notice={
          store.authFailed
            ? 'Your credentials were rejected by the server — please sign in again.'
            : undefined
        }
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
          <button
            onClick={() => {
              void store.actions.reset()
              // reset() wipes stored creds + local mirror; drop App state too,
              // or the sync-gate stays stuck (ready=false, settings unchanged
              // → the sync effect never re-runs) until a hard refresh.
              setSettings(null)
            }}
          >
            start over
          </button>
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
  // In unread-only mode, a feed/folder scope probed by the native unread
  // query (getRead=false, no limit) contains ALL its unread items locally —
  // there is nothing left to page, so suppress the history walk entirely.
  const unreadScopeProbed =
    !showAll &&
    (view.kind === 'feed' || view.kind === 'folder') &&
    store.unreadDrained.has(unreadScopeKey(view.kind === 'feed' ? 0 : 1, view.id))
  const moreServer = unreadScopeProbed ? false : liveCount > 0
  // Drained = the view's feeds are all paged to the server end (or the
  // view has no feeds of its own to page, e.g. an empty folder).
  const drained = unreadScopeProbed || scope.length === 0 || liveCount === 0

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
          <Seg<boolean>
            title="items shown: all, or only unread"
            value={showAll}
            onChange={setShowAll}
            options={[
              { value: false, label: 'only unread' },
              { value: true, label: 'all' },
            ]}
          />
          <Seg<SortMode>
            value={sortMode}
            onChange={setSortMode}
            options={[
              { value: 'newest', label: 'newest' },
              { value: 'rarity', label: 'rarity', title: 'weighted rarity: rare feeds first' },
            ]}
          />
          <span className="muted sync">{pool.length} local</span>
          <IconButton
            className="add-btn"
            title="add feed or folder"
            onClick={() => setShowAdd(true)}
          >
            +
          </IconButton>
          <IconButton
            className="add-btn"
            title="settings"
            onClick={() => setShowSettings(true)}
          >
            ⚙
          </IconButton>
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
          articleTheme={articleTheme}
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
      // Dedicated view: ALL items, independent of the global toggle.
      list = items
      break
    case 'allUnread':
      // Dedicated view: unread only, independent of the global toggle.
      list = items.filter((i) => i.unread)
      break
    case 'starred':
      // Independent of the global toggle: always show all starred.
      list = items.filter((i) => i.starred)
      break
    case 'feed':
    case 'folder':
      // Feeds/folders RESPECT the global only-unread/all toggle, since
      // these are the views you read through day-to-day.
      list = items.filter((i) => {
        if (view.kind === 'feed') return i.feedId === view.id
        // folder: item belongs if its feed is a member of the folder
        const memberFeeds = feedOfFolder?.get(view.id)
        return !!memberFeeds && memberFeeds.has(i.feedId)
      })
      if (!showAll) list = list.filter((i) => i.unread)
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

// --- URL state (restore open view + selected item on reload) ---
// Scheme: ?view=all|allUnread|starred|feed|folder&id=<n>&item=<n>

function viewFromUrl(): View {
  const p = new URLSearchParams(window.location.search)
  const kind = p.get('view')
  const id = p.get('id')
  switch (kind) {
    case 'allUnread':
      return { kind: 'allUnread' }
    case 'starred':
      return { kind: 'starred' }
    case 'feed':
      return id ? { kind: 'feed', id: Number(id) } : { kind: 'all' }
    case 'folder':
      return id ? { kind: 'folder', id: Number(id) } : { kind: 'all' }
    default:
      return { kind: 'all' }
  }
}

function writeViewToUrl(view: View): void {
  const p = new URLSearchParams(window.location.search)
  if (view.kind === 'feed' || view.kind === 'folder') {
    p.set('view', view.kind)
    p.set('id', String(view.id))
  } else {
    p.set('view', view.kind)
    p.delete('id')
  }
  writeUrl(p)
}

function itemIdFromUrl(): number | null {
  const p = new URLSearchParams(window.location.search)
  const v = p.get('item')
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function writeItemIdToUrl(id: number | null): void {
  const p = new URLSearchParams(window.location.search)
  if (id === null) p.delete('item')
  else p.set('item', String(id))
  writeUrl(p)
}

/** replaceState (not push) — the URL is a bookmarkable snapshot of the
 *  current view, not navigation history. */
function writeUrl(p: URLSearchParams): void {
  const qs = p.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', url)
}