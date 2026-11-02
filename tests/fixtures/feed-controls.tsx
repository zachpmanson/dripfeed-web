import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Sidebar } from '../../src/components/feed/Sidebar'
import { AddModal } from '../../src/components/feed/AddModal'
import { SettingsModal } from '../../src/components/settings/SettingsModal'
import AppHeader from '../../src/components/app/AppHeader'
import ErrorToast from '../../src/components/app/ErrorToast'
import { Seg } from '../../src/components/ui/Seg'
import { IconButton } from '../../src/components/ui/IconButton'
import type { NewsFeed } from '../../src/api/types'
import '../../src/index.css'

const settings = { baseUrl: '', user: 'fixture', appPassword: 'fixture' }
const feed = {
  id: 42,
  title: 'Example feed',
  folderId: null,
  unreadCount: 3,
  url: 'https://fixture.invalid/feed',
  link: null,
  fullTextEnabled: false,
} as NewsFeed
const folders = Array.from({ length: 35 }, (_, index) => ({
  id: index + 1,
  parentId: null,
  opened: true,
  name: index === 0 ? 'Destination' : `Folder ${index + 1} ${'long '.repeat(8)}`,
}))
const log = {
  writes: [] as unknown[],
  changes: 0,
  selected: 0,
  mode: 'resolve',
  copyMode: 'resolve',
  copyCalls: 0,
  pending: [] as ((fail: boolean) => void)[],
  copies: [] as ((fail: boolean) => void)[],
  values: [] as unknown[],
}
window.fixtureLog = log
window.fixtureWrite = (kind, args) => {
  log.writes.push({ kind, args })
  if (log.mode === 'reject') return Promise.reject(new Error('Fixture write failed'))
  if (log.mode === 'pending')
    return new Promise((resolve, reject) =>
      log.pending.push((fail) =>
        fail ? reject(new Error('Fixture write failed')) : resolve(undefined),
      ),
    )
  return Promise.resolve()
}
window.fixtureCopy = () => {
  log.copyCalls++
  if (log.copyMode === 'reject') return Promise.reject(new Error('Fixture copy failed'))
  if (log.copyMode === 'pending')
    return new Promise((resolve, reject) =>
      log.copies.push((fail) =>
        fail ? reject(new Error('Fixture copy failed')) : resolve(undefined),
      ),
    )
  return Promise.resolve()
}
function Fixture() {
  const [visibleFolders, setVisibleFolders] = useState(folders)
  window.fixtureRemoveFolder = () => setVisibleFolders([])
  const [feeds, setFeeds] = useState(
    new Map([
      [42, feed],
      [43, { ...feed, id: 43, title: 'Other feed' }],
    ]),
  )
  const [open, setOpen] = useState('')
  const [covered, setCovered] = useState(false)
  window.fixtureCover = () => setCovered(true)
  const [showMode, setShowMode] = useState('all')
  const [sortMode, setSortMode] = useState('newest')
  const [theme, setTheme] = useState('dark')
  const [cssMode, setCssMode] = useState('default')
  const [preferences, setPreferences] = useState([true, true, true])
  const [numeric, setNumeric] = useState(0)
  const [bool, setBool] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clicks, setClicks] = useState(0)
  window.fixtureReplaceRow = () => setFeeds(new Map([[42, { ...feed, folderId: 1 }]]))
  window.fixtureRemoveRow = () => setFeeds(new Map())
  window.fixtureShowError = setError
  const preference = (index, value) => {
    log.values.push(value)
    setPreferences((old) => old.map((v, i) => (i === index ? value : v)))
  }
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader
        showMode={showMode}
        onShowModeChange={(value) => {
          log.values.push(value)
          setShowMode(value)
        }}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        syncing={false}
        poolLength={0}
        onSync={() => {}}
        onAdd={() => setOpen('add')}
        onSettings={() => setOpen('settings')}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          feeds={feeds}
          folders={visibleFolders}
          items={[]}
          view={{ kind: 'feed', id: 42 }}
          onSelect={() => log.selected++}
          settings={settings}
          showFavicons={false}
          rarityStats={new Map()}
          onMetaChanged={() => log.changes++}
        />
        <main className="min-w-0 flex-1 p-2">
          <button id="background" onClick={() => setClicks((n) => n + 1)}>
            Background {clicks}
          </button>
          <Seg
            title="Numeric choice"
            value={numeric}
            onChange={(value) => {
              log.values.push(value)
              setNumeric(value)
            }}
            options={[
              { value: 0, label: 'Zero' },
              { value: 1, label: 'One' },
            ]}
          />
          <Seg
            title="Boolean choice"
            value={bool}
            onChange={(value) => {
              log.values.push(value)
              setBool(value)
            }}
            options={[
              { value: false, label: 'False' },
              { value: true, label: 'True' },
            ]}
          />
          <IconButton title="Disabled hint" disabled onClick={() => log.selected++}>
            ×
          </IconButton>
        </main>
      </div>
      {open === 'add' && (
        <AddModal
          folders={folders}
          settings={settings}
          onClose={() => setOpen('')}
          onCreated={() => log.changes++}
        />
      )}
      {(open === 'settings' || covered) && (
        <SettingsModal
          feeds={[...feeds.values()]}
          folders={folders}
          uiTheme={theme}
          articleCssMode={cssMode}
          articleCss=""
          showFavicons={preferences[0]}
          singleClickRead={preferences[1]}
          dimBoilerplate={preferences[2]}
          onUiTheme={setTheme}
          onArticleCssMode={setCssMode}
          onArticleCss={() => {}}
          onShowFavicons={(value) => preference(0, value)}
          onSingleClickRead={(value) => preference(1, value)}
          onDimBoilerplate={(value) => preference(2, value)}
          onLogout={() => {}}
          onClose={() => (covered ? setCovered(false) : setOpen(''))}
        />
      )}
      <ErrorToast error={error} onDismiss={() => setError(null)} />
    </div>
  )
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
)
