import { useEffect, useState } from 'react'
import { useStore } from './hooks'
import { loadSettings } from './settings'
import type { Settings } from './settings'
import { SettingsForm } from './components/SettingsForm'
import { Sidebar, type View } from './components/Sidebar'
import { ItemList } from './components/ItemList'
import { ItemView } from './components/ItemView'
import { rarityMultipliers, rarityStats, sortByRarity } from './rarity'
import type { NewsItem } from './api/types'

type SortMode = 'newest' | 'rarity'

const SORT_KEY = 'dripfeed.sort'
const SHOW_ALL_KEY = 'dripfeed.showAll'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(loadSettings)
  const [view, setView] = useState<View>({ kind: 'unread' })
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

  const store = useStore(settings)

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
          <h1>dripfeed</h1>
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

  const { items, feeds, folders, count, allLoaded } = store

  const visibleItems = filterView(items, view, sortMode, showAll)
  const rarStats = sortMode === 'rarity' ? rarityStats(items) : undefined

  const feedTitle = (feedId: number) => feeds.get(feedId)?.title ?? `feed ${feedId}`
  const selected =
    (selectedId !== null && items.find((i) => i.id === selectedId)) || visibleItems[0] || null

  return (
    <div className="app">
      <header className="app-header">
        <h1>dripfeed</h1>
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
          <span className="muted sync">{count} local</span>
          <button onClick={() => store.actions.reset()}>settings</button>
        </div>
      </header>

      <main className="app-body">
        {store.error && <div className="error">{store.error}</div>}
        <Sidebar
          feeds={feeds}
          folders={folders}
          items={items}
          view={view}
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
            onSelect={setSelectedId}
            onRead={(item: NewsItem) => {
              void store.actions.setRead(item, !item.unread)
            }}
            rarityMode={sortMode === 'rarity'}
            rarityStats={rarStats}
            emptyText={showAll ? 'No items here.' : 'No unread items. Nothing dripping?'}
          />
          {!allLoaded && visibleItems.length > 0 && (
            <button className="load-more" onClick={() => store.loadMore()}>
              load more
            </button>
          )}
        </div>
        <ItemView item={selected} feedTitle={feedTitle} actions={store.actions} />
      </main>
    </div>
  )
}

function filterView(
  items: NewsItem[],
  view: View,
  sortMode: SortMode,
  showAll: boolean,
): NewsItem[] {
  let list: NewsItem[]
  switch (view.kind) {
    case 'unread':
      list = showAll ? items : items.filter((i) => i.unread)
      break
    case 'starred':
      list = items.filter((i) => i.starred && (showAll || i.unread))
      break
    case 'feed':
      list = items.filter((i) => i.feedId === view.id && (showAll || i.unread))
      break
  }
  if (view.kind !== 'feed' && sortMode === 'rarity') {
    // Multipliers over the loaded set (DB-backed: full history after sync).
    const mult = rarityMultipliers(items)
    return sortByRarity(list, mult)
  }
  return list.sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
}