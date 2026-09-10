import { useEffect, useRef, useState } from 'react'
import { PlusIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
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
  loadArticleCss,
  loadArticleCssMode,
  loadShowFavicons,
  loadThemeSetting,
  sanitizeArticleCss,
  saveArticleCss,
  saveArticleCssMode,
  saveShowFavicons,
  saveThemeSetting,
  uiThemeKey,
  type ArticleCssMode,
  type ThemeSetting,
} from './theme'
import { rarityMultipliers, rarityStats, sortByRarity } from './rarity'
import type { NewsItem } from './api/types'

type SortMode = 'newest' | 'rarity'

/** Header visibility dropdown: what the item list shows. 'priority' shows
 *  every item but floats unread ones above read (a view option, not a
 *  sort — it rides on top of whichever sort mode is selected). */
type ShowMode = 'all' | 'unread' | 'priority'

const SORT_KEY = 'dripfeed.sort'
const SHOW_MODE_KEY = 'dripfeed.showMode'
const LEGACY_SHOW_ALL_KEY = 'dripfeed.showAll'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(loadSettings)
  const [view, setView] = useState<View>(() => viewFromUrl())
  const [selectedId, setSelectedId] = useState<number | null>(() => itemIdFromUrl())
  // Bumped when the reader header's feed name is clicked, so the sidebar
  // knows to reveal (expand folder + scroll) that feed in sync.
  const [revealNonce, setRevealNonce] = useState(0)
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const stored = localStorage.getItem(SORT_KEY)
    return stored === 'newest' ? 'newest' : 'rarity'
  })
  const [showMode, setShowMode] = useState<ShowMode>(() => {
    const stored = localStorage.getItem(SHOW_MODE_KEY)
    if (stored === 'all' || stored === 'unread' || stored === 'priority') return stored
    // One-time migration from the old boolean toggle ('1' = all, else the
    // default). Default is 'priority' (Unread first).
    return localStorage.getItem(LEGACY_SHOW_ALL_KEY) === '1' ? 'all' : 'priority'
  })

  // Keep the URL in sync with the open view + selected item: each
  // navigation pushes exactly one history entry (so Back/Forward walk the
  // view/item trail) and a refresh restores the same place. Values are
  // written together so a feed/folder switch (view + item reset in one
  // event) can't leave a ghost item behind. pushState never fires
  // popstate, so there's no round-trip to suppress — writeUrl's
  // unchanged-URL check is what skips re-pushing after a pop restores
  // state.
  useEffect(() => {
    writeUrl(view, selectedId)
  }, [view, selectedId])

  // Back/forward: the URL changed — read view + item back out of the query
  // string. The effect above then sees the URL already matching and skips
  // pushing, so no duplicate history entries.
  useEffect(() => {
    const onPop = () => {
      setView(viewFromUrl())
      setSelectedId(itemIdFromUrl())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    localStorage.setItem(SORT_KEY, sortMode)
  }, [sortMode])

  useEffect(() => {
    localStorage.setItem(SHOW_MODE_KEY, showMode)
  }, [showMode])

  const store = useStore(settings, view, showMode === 'unread')
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
  const [articleCssMode, setArticleCssModeState] = useState<ArticleCssMode>(loadArticleCssMode)
  const [articleCss, setArticleCssState] = useState<string>(loadArticleCss)
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
  const setArticleCssMode = (v: ArticleCssMode) => {
    setArticleCssModeState(v)
    saveArticleCssMode(v)
  }
  const setArticleCss = (v: string) => {
    // Sanitize on save so hostile url()/@import never reaches the frame.
    setArticleCssState(v)
    saveArticleCss(sanitizeArticleCss(v))
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
  // In-flight work is deduped per scope inside the store's probeUnread, so
  // switching scopes mid-probe starts the new scope's probe instead of
  // skipping it, and a failed probe leaves the scope un-drained for the
  // "Load more" button to retry.
  useEffect(() => {
    if (!settings) return
    if (showMode !== 'unread') return
    if (view.kind !== 'feed' && view.kind !== 'folder') return
    const type = view.kind === 'feed' ? 0 : 1
    if (store.unreadDrained.has(unreadScopeKey(type, view.id))) return
    void store.actions.ensureUnread(type, view.id)
  }, [view, settings, showMode, store.actions, store.unreadDrained])

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
            <p className="muted spinner-row">
              <span className="spinner" aria-hidden="true" />
              connecting…
            </p>
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
    showMode === 'unread' &&
    (view.kind === 'feed' || view.kind === 'folder') &&
    store.unreadDrained.has(unreadScopeKey(view.kind === 'feed' ? 0 : 1, view.id))
  const moreServer = unreadScopeProbed ? false : liveCount > 0
  // Drained = the view's feeds are all paged to the server end (or the
  // view has no feeds of its own to page, e.g. an empty folder).
  const drained = unreadScopeProbed || scope.length === 0 || liveCount === 0
  // While the native unread probe is in flight the trailing row shows
  // "Loading…" — never a clickable button, because in only-unread
  // feed/folder mode the button's only real job is to (re)run that probe
  // and the pending state would otherwise be a button that no-ops.
  const unreadProbing =
    showMode === 'unread' &&
    (view.kind === 'feed' || view.kind === 'folder') &&
    store.unreadProbing &&
    moreServer &&
    !drained

  // Filter + rank the WHOLE pool, then slice for display. Rarity/selected
  // operate over the full pool (rarity's 20-item feed sample is stable
  // regardless of how much history load-more has pulled in).
  const rarMult = sortMode === 'rarity' ? rarityMultipliers(pool) : undefined
  const rarStats = sortMode === 'rarity' ? rarityStats(pool) : undefined
  const visibleItems = filterView(pool, view, sortMode, showMode, rarMult, feedOfFolder)

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
          <select
            className="header-select"
            title="Items shown: all, unread only, or all items with unread floated to the top"
            value={showMode}
            onChange={(e) => setShowMode(e.target.value as ShowMode)}
          >
            <option value="all">All items</option>
            <option value="unread">Unread only</option>
            <option value="priority">Unread first</option>
          </select>
          <Seg<SortMode>
            value={sortMode}
            onChange={setSortMode}
            options={[
              { value: 'newest', label: 'Newest' },
              { value: 'rarity', label: 'Rarity', title: 'Weighted rarity: rare feeds first' },
            ]}
          />
          <button
            className={`muted sync${store.syncing ? ' syncing' : ''}`}
            title="Refresh now — re-sync newest items, feeds and folders"
            onClick={() => void store.actions.syncNow()}
          >
            {store.syncing && (
              <span className="sync-spinner" aria-hidden="true">
                ↻
              </span>
            )}
            {pool.length} local
          </button>
          <IconButton
            className="add-btn"
            title="Add feed or folder"
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon className="btn-icon" />
          </IconButton>
          <IconButton
            className="add-btn"
            title="Settings"
            onClick={() => setShowSettings(true)}
          >
            <Cog6ToothIcon className="btn-icon" />
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
          revealFeed={{ id: view.kind === 'feed' ? view.id : 0, nonce: revealNonce }}
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
            emptyText={showMode === 'unread' ? 'No unread items. Nothing dripping?' : 'No items here.'}
            onLoadMore={store.loadMore}
            moreServer={moreServer}
            drained={drained}
            loadingMore={loadingMore || unreadProbing}
            paging={paging}
          />
        </div>
        <ItemView
          item={selected}
          feedTitle={feedTitle}
          actions={store.actions}
          articleTheme={articleTheme}
          articleCssMode={articleCssMode}
          articleCss={articleCss}
          onFeedClick={(feedId) => {
            setView({ kind: 'feed', id: feedId })
            setSelectedId(null)
            setRevealNonce(revealNonce + 1)
          }}
        />
      </main>
      {showAdd && settings && (
        <AddModal
          folders={folders}
          settings={settings}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            // refresh feeds/folders meta so the new item shows in the sidebar,
            // then close the modal on success
            void store.actions.refreshMeta()
            setShowAdd(false)
          }}
        />
      )}
      {showSettings && (
        <SettingsModal
          uiTheme={uiTheme}
          articleTheme={articleTheme}
          articleCssMode={articleCssMode}
          articleCss={articleCss}
          showFavicons={showFavicons}
          onUiTheme={setUiTheme}
          onArticleTheme={setArticleTheme}
          onArticleCssMode={setArticleCssMode}
          onArticleCss={setArticleCss}
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
  showMode: ShowMode,
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
      if (showMode === 'unread') list = list.filter((i) => i.unread)
      break
  }
  // Rarity applies to feed/folder views too — the user picks the mode and
  // expects a rare article to float up wherever they read. (Chronological
  // sort stays available via the Newest toggle.) Multipliers cover the full
  // pool, not the visible slice.
  let ranked: NewsItem[]
  if (sortMode === 'rarity') {
    ranked = sortByRarity(list, rarMult)
  } else {
    ranked = list.sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
  }
  // Unread priority queue — a VIEW option, not a sort: it rides on top of
  // the chosen order so every unread item ranks above every read item, with
  // each group keeping the sort's internal order.
  if (showMode === 'priority') {
    const unread: NewsItem[] = []
    const read: NewsItem[] = []
    for (const i of ranked) (i.unread ? unread : read).push(i)
    return unread.concat(read)
  }
  return ranked
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

function itemIdFromUrl(): number | null {
  const p = new URLSearchParams(window.location.search)
  const v = p.get('item')
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/** pushState (not replace) so each navigation is a history entry and
 *  back/forward walk the view/item trail. View + item are written together
 *  so a view switch clears a stale item in the SAME entry. Skips pushing
 *  when the URL is unchanged — which also prevents re-pushing after a pop
 *  restores state. */
function writeUrl(view: View, selectedId: number | null): void {
  const p = new URLSearchParams(window.location.search)
  if (view.kind === 'feed' || view.kind === 'folder') {
    p.set('view', view.kind)
    p.set('id', String(view.id))
  } else {
    p.set('view', view.kind)
    p.delete('id')
  }
  if (selectedId === null) p.delete('item')
  else p.set('item', String(selectedId))
  const qs = p.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  if (window.location.search !== `?${qs}`) {
    window.history.pushState(null, '', url)
  }
}