import { useState } from 'react'
import { useNews, useNewsActions } from './hooks'
import { clearSettings, loadSettings } from './settings'
import type { Settings } from './settings'
import { SettingsForm } from './components/SettingsForm'
import { Sidebar, type View } from './components/Sidebar'
import { ItemList } from './components/ItemList'
import { ItemView } from './components/ItemView'
import type { NewsItem } from './api/types'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(loadSettings)
  const [view, setView] = useState<View>({ kind: 'unread' })
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const newsQuery = useNews(settings)
  const actions = useNewsActions(settings)

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

  const { items, feeds, folders } = newsQuery.data

  const visibleItems = filterView(items, view)

  const feedTitle = (feedId: number) => feeds.get(feedId)?.title ?? `feed ${feedId}`
  const selected =
    (selectedId !== null && items.get(selectedId)) || visibleItems[0] || null

  return (
    <div className="app">
      <header className="app-header">
        <h1>dripfeed</h1>
        <div className="header-right">
          {newsQuery.isFetching && <span className="muted sync">syncing…</span>}
          <button
            onClick={() => {
              void newsQuery.refetch()
            }}
          >
            refresh
          </button>
          <button
            onClick={() => {
              clearSettings()
              setSettings(null)
            }}
          >
            settings
          </button>
        </div>
      </header>

      <main className="app-body">
        {newsQuery.isError && <div className="error">{String(newsQuery.error)}</div>}
        <Sidebar feeds={feeds} folders={folders} items={items}
          view={view}
          onSelect={(v) => {
            setView(v)
            setSelectedId(null)
          }}
        />
        <ItemList
          items={visibleItems}
          selectedId={selected?.id ?? null}
          feedTitle={feedTitle}
          onSelect={setSelectedId}
          onRead={(item: NewsItem) => {
            actions.toggleRead.mutate({ id: item.id, unread: item.unread })
          }}
        />
        <ItemView item={selected} feedTitle={feedTitle} actions={actions} />
      </main>
    </div>
  )
}

function filterView(items: Map<number, NewsItem>, view: View): NewsItem[] {
  let list: NewsItem[]
  switch (view.kind) {
    case 'unread':
      list = [...items.values()].filter((i) => i.unread)
      break
    case 'starred':
      list = [...items.values()].filter((i) => i.starred)
      break
    case 'feed':
      list = [...items.values()].filter((i) => i.feedId === view.id)
      break
  }
  // newest first — rarity sorting replaces this later
  return list.sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
}