import { useEffect, useRef, useState } from 'react'
import useUrlState from './hooks/useUrlState'
import useListPreferences from './hooks/useListPreferences'
import useThemePreferences from './hooks/useThemePreferences'
import { useStore } from './hooks'
import { unreadScopeKey } from './store'
import { loadSettings } from './settings'
import type { Settings } from './settings'
import { SettingsForm } from './components/settings/SettingsForm'
import { Sidebar } from './components/feed/Sidebar'
import { ItemList } from './components/items/ItemList'
import { ItemView } from './components/reader/ItemView'
import { AddModal } from './components/feed/AddModal'
import { SettingsModal } from './components/settings/SettingsModal'
import AppHeader from './components/app/AppHeader'
import SyncGate from './components/app/SyncGate'
import { rarityMultipliers, rarityStats } from './rarity'
import { filterView } from './selectors'
import type { NewsItem } from './api/types'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(loadSettings)
  const { view, setView, selectedId, setSelectedId } = useUrlState()
  // Bumped when the reader header's feed name is clicked, so the sidebar
  // knows to reveal (expand folder + scroll) that feed in sync.
  const [revealNonce, setRevealNonce] = useState(0)
  const { sortMode, setSortMode, showMode, setShowMode } = useListPreferences()
  const store = useStore(settings, view, showMode === 'unread')
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Credentials rejected (401): the store already wiped localStorage/IDB;
  // drop back to the settings form so the user can re-enter them.
  useEffect(() => {
    if (store.authFailed) setSettings(null)
  }, [store.authFailed])

  const {
    uiTheme,
    articleTheme,
    articleCssMode,
    articleCss,
    showFavicons,
    singleClickRead,
    dimBoilerplate,
    setUiTheme,
    setArticleTheme,
    setArticleCssMode,
    setArticleCss,
    setShowFavicons,
    setSingleClickRead,
    setDimBoilerplate,
  } = useThemePreferences()

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
      <SyncGate
        error={store.error}
        progress={store.progress}
        onStartOver={() => {
          void store.actions.reset()
          // reset() wipes stored creds + local mirror; drop App state too,
          // or the sync-gate stays stuck (ready=false, settings unchanged
          // → the sync effect never re-runs) until a hard refresh.
          setSettings(null)
        }}
      />
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
  const rarStats = rarityStats(pool)
  const visibleItems = filterView(pool, view, sortMode, showMode, rarMult, feedOfFolder)

  // Identity of the current VIEW, for the item list's render window: feed /
  // folder / all / starred, the show mode and the sort mode — never the data.
  // ItemList restarts its 50-row window when this changes and only then; a
  // sync that appends or removes items leaves the window (and so the reader's
  // scroll position) where it is. The window is applied inside ItemList, after
  // this filtering + ordering, so it slices a fully filtered, fully sorted
  // list.
  const viewKey =
    `${view.kind}:${view.kind === 'feed' || view.kind === 'folder' ? view.id : ''}` +
    `:${showMode}:${sortMode}`

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
  const recentBodies = selected
    ? (() => {
        const recent = pool
          .filter((i) => i.feedId === selected.feedId)
          .sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
          .slice(0, 5)
        if (!recent.some((i) => i.id === selected.id)) recent.push(selected)
        return recent.map((i) => i.body)
      })()
    : []

  return (
    <div className="app">
      <AppHeader
        showMode={showMode}
        onShowModeChange={setShowMode}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        syncing={store.syncing}
        poolLength={pool.length}
        onSync={() => void store.actions.syncNow()}
        onAdd={() => setShowAdd(true)}
        onSettings={() => setShowSettings(true)}
      />

      <main className="app-body">
        {store.error && <div className="error">{store.error}</div>}
        <Sidebar
          feeds={feeds}
          folders={folders}
          items={pool}
          view={view}
          settings={settings}
          showFavicons={showFavicons}
          rarityStats={rarStats}
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
            windowKey={viewKey}
            selectedId={selected?.id ?? null}
            feedTitle={feedTitle}
            feedById={feedById}
            showFavicons={showFavicons}
            singleClickRead={singleClickRead}
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
          dimBoilerplate={dimBoilerplate}
          recentBodies={recentBodies}
          autoExtract={
            selected ? (feedById(selected.feedId)?.fullTextEnabled ?? false) : false
          }
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
          feeds={[...store.feeds.values()]}
          folders={store.folders}
          uiTheme={uiTheme}
          articleTheme={articleTheme}
          articleCssMode={articleCssMode}
          articleCss={articleCss}
          showFavicons={showFavicons}
          singleClickRead={singleClickRead}
          dimBoilerplate={dimBoilerplate}
          onUiTheme={setUiTheme}
          onArticleTheme={setArticleTheme}
          onArticleCssMode={setArticleCssMode}
          onArticleCss={setArticleCss}
          onShowFavicons={setShowFavicons}
          onSingleClickRead={setSingleClickRead}
          onDimBoilerplate={setDimBoilerplate}
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
