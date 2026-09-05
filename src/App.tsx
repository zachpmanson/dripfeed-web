import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { clearSettings, loadSettings } from './settings'
import { fetchFeeds, fetchItems, markRead } from './api/news'
import { LIST_TYPES } from './api/types'
import { SettingsForm } from './components/SettingsForm'
import { ItemList } from './components/ItemList'
import { ItemView } from './components/ItemView'
import type { NewsItem } from './api/types'

export default function App() {
  const [settings, setSettings] = useState(loadSettings)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const feedsQuery = useQuery({
    queryKey: ['feeds'],
    queryFn: () => fetchFeeds(settings!),
    enabled: !!settings,
  })

  const itemsQuery = useQuery({
    queryKey: ['items', 'unread'],
    // Bootstrap slice: newest unread, bigish batch. The full IndexedDB sync
    // engine replaces this in milestone 2.
    queryFn: () =>
      fetchItems(settings!, {
        type: LIST_TYPES.ALL,
        getRead: false,
        batchSize: 200,
        oldestFirst: false,
      }),
    enabled: !!settings,
  })

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

  const items = itemsQuery.data?.items ?? []
  const feeds = feedsQuery.data?.feeds ?? []
  const feedTitle = (feedId: number) => feeds.find((f) => f.id === feedId)?.title ?? `feed ${feedId}`
  const selected = items.find((i) => i.id === selectedId) ?? null

  return (
    <div className="app">
      <header className="app-header">
        <h1>dripfeed</h1>
        <div className="header-right">
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['items'] })
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
        {itemsQuery.isError && (
          <div className="error">{String(itemsQuery.error)}</div>
        )}
        <ItemList
          items={items}
          selectedId={selectedId}
          feedTitle={feedTitle}
          onSelect={(id) => setSelectedId(id)}
          onRead={(item: NewsItem) => {
            // double-click: mark read on the server, drop from the unread list
            void markRead(settings, item.id)
            queryClient.setQueryData<{ items: NewsItem[] }>(['items', 'unread'], (old) =>
              old ? { ...old, items: old.items.filter((i) => i.id !== item.id) } : old,
            )
          }}
        />
        <ItemView item={selected} feedTitle={feedTitle} settings={settings} />
      </main>
    </div>
  )
}