import { useEffect, useMemo, useRef, useState } from 'react'
import { dbGetGeneration } from './db'
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
import ErrorToast from './components/app/ErrorToast'
import { buildAppViewModel } from './appViewModel'
import type { NewsItem } from './api/types'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(loadSettings)
  // Bind the reader to the login that supplies its items, not to arbitrary
  // rerenders while an asynchronous reset still leaves the old pool visible.
  const readerGeneration = useMemo(dbGetGeneration, [settings])
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
    articleCssMode,
    articleCss,
    showFavicons,
    singleClickRead,
    dimBoilerplate,
    setUiTheme,
    setArticleCssMode,
    setArticleCss,
    setShowFavicons,
    setSingleClickRead,
    setDimBoilerplate,
  } = useThemePreferences()

  // On navigation to an individual feed: top the local window up to 20 and
  // probe the server for whether more history exists (so a short/partial
  // feed auto-fills and the load-more button reflects reality). In-flight
  // guard per feed so StrictMode/revisits share pending work, without
  // dropping a destination feed's refill while another feed is loading.
  const ensureRef = useRef(new Set<number>())
  useEffect(() => {
    if (view.kind !== 'feed' || !settings) return
    // In unread-only mode the native unread query below supersedes the
    // window top-up for THIS visit; the window/cursor probe still runs so
    // toggling to "all" pages instantly.
    const feedId = view.id
    const inFlight = ensureRef.current
    if (inFlight.has(feedId)) return
    inFlight.add(feedId)
    void store.actions.ensureFeed(feedId).finally(() => {
      inFlight.delete(feedId)
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

  const model = buildAppViewModel({
    pool,
    feeds,
    cursors,
    view,
    showMode,
    sortMode,
    selectedId,
    unreadDrained: store.unreadDrained,
    unreadProbing: store.unreadProbing,
  })
  const {
    visibleItems,
    selected,
    recentBodies,
    rarityStats: rarStats,
    moreServer,
    drained,
    unreadProbing,
    viewKey,
  } = model
  const feedTitle = (feedId: number) => feeds.get(feedId)?.title ?? `feed ${feedId}`
  const feedById = (feedId: number) => feeds.get(feedId)

  return (
    <div className="app flex h-full flex-col bg-app-bg text-app-text">
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

      <ErrorToast error={store.error} onDismiss={store.actions.clearError} />

      <main className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(16rem,24rem)_1fr]">
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
        <div className="flex min-h-0 flex-col">
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
            emptyText={
              showMode === 'unread' ? 'No unread items. Nothing dripping?' : 'No items here.'
            }
            onLoadMore={store.loadMore}
            moreServer={moreServer}
            drained={drained}
            loadingMore={loadingMore || unreadProbing}
            paging={paging}
          />
        </div>
        <ItemView
          key={readerGeneration}
          item={selected}
          feedTitle={feedTitle}
          actions={store.actions}
          articleCssMode={articleCssMode}
          articleCss={articleCss}
          dimBoilerplate={dimBoilerplate}
          recentBodies={recentBodies}
          autoExtract={selected ? (feedById(selected.feedId)?.fullTextEnabled ?? false) : false}
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
          articleCssMode={articleCssMode}
          articleCss={articleCss}
          showFavicons={showFavicons}
          singleClickRead={singleClickRead}
          dimBoilerplate={dimBoilerplate}
          onUiTheme={setUiTheme}
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
