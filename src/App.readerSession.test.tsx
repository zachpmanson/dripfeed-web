// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, StrictMode, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppData } from './hooks'
import type { NewsFeed, NewsItem } from './api/types'
import { resetLocal } from './store'
import { saveSettings } from './settings'
import App from './App'
import type AppHeader from './components/app/AppHeader'
import type { SettingsForm } from './components/settings/SettingsForm'
import type { SettingsModal } from './components/settings/SettingsModal'

const mocks = vi.hoisted(() => ({ store: null as AppData | null }))

// Keep the real App, URL selection, view model, ItemView, and DB generation.
// Only replace the data source and unrelated chrome around the reader.
vi.mock('./hooks', () => ({ useStore: () => mocks.store! }))
vi.mock('./hooks/useListPreferences', () => ({
  default: () => ({ showMode: 'all', sortMode: 'newest' }),
}))
vi.mock('./hooks/useThemePreferences', () => ({
  default: () => ({ articleCssMode: 'default', articleCss: '', dimBoilerplate: false }),
}))
vi.mock('./components/feed/Sidebar', () => ({ Sidebar: () => null }))
vi.mock('./components/items/ItemList', () => ({ ItemList: () => null }))
vi.mock('./components/app/AppHeader', () => ({
  default: ({ onSettings }: ComponentProps<typeof AppHeader>) => (
    <button onClick={onSettings}>Settings</button>
  ),
}))
vi.mock('./components/settings/SettingsForm', () => ({
  SettingsForm: ({ onSave }: ComponentProps<typeof SettingsForm>) => (
    <button onClick={() => onSave({ baseUrl: '', user: 'new reader', appPassword: 'password' })}>
      Sign in
    </button>
  ),
}))
vi.mock('./components/settings/SettingsModal', () => ({
  SettingsModal: ({ onLogout, onClose }: ComponentProps<typeof SettingsModal>) => (
    <>
      <button onClick={onLogout}>Log out</button>
      <button onClick={onClose}>Close settings</button>
    </>
  ),
}))

function item(url: string): NewsItem {
  return {
    id: 42,
    guid: '42',
    guidHash: '42',
    url,
    title: url,
    author: null,
    pubDate: null,
    updatedDate: null,
    body: 'Summary',
    enclosureMime: null,
    enclosureLink: null,
    mediaThumbnail: null,
    mediaDescription: null,
    feedId: 1,
    unread: true,
    starred: false,
    filtered: false,
    lastModified: 0,
    rtl: false,
    intro: null,
    fingerprint: null,
    categories: [],
    sharedBy: null,
    sharedByDisplayName: null,
  }
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const oldItem = item('https://old.example.com/article')
const newItem = item('https://new.example.com/article')
let root: Root
let container: HTMLDivElement
let resetRequest: Promise<void> | undefined

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  await resetLocal()
  saveSettings({ baseUrl: '', user: 'old reader', appPassword: 'password' })
  window.history.replaceState(null, '', '/?view=all&item=42')
  resetRequest = undefined
  mocks.store = {
    ready: true,
    pool: [oldItem],
    feeds: new Map([
      [1, { id: 1, title: 'Feed', folderId: null, fullTextEnabled: true } as NewsFeed],
    ]),
    folders: [],
    cursors: new Map(),
    unreadDrained: new Set(),
    unreadProbing: false,
    loadingMore: false,
    paging: null,
    progress: null,
    error: null,
    authFailed: false,
    syncing: false,
    loadMore: vi.fn(async () => {}),
    actions: {
      extractFulltext: vi.fn(async () => {}),
      setRead: vi.fn(async () => {}),
      setStar: vi.fn(async () => {}),
      ensureFeed: vi.fn(async () => {}),
      ensureUnread: vi.fn(async () => 0),
      refreshMeta: vi.fn(async () => {}),
      syncNow: vi.fn(async () => {}),
      clearError: vi.fn(),
      reset: () => (resetRequest = resetLocal()),
    },
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  await resetRequest
  container.remove()
  vi.unstubAllGlobals()
})

async function render() {
  await act(async () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
}

async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  )
  expect(button, `button ${label}`).toBeDefined()
  await act(async () => button!.click())
}

function extractButton() {
  return container.querySelector<HTMLButtonElement>('button[title^="Extract full article"]')!
}

async function signInToNewSession() {
  await click('Settings')
  await click('Log out')
  await resetRequest
  mocks.store!.pool = [newItem]
  await click('Sign in')
}

it.each(['resolve', 'reject'] as const)(
  'keeps a stale mounted %s and unrelated App renders from spending the next session attempt',
  async (outcome) => {
    const oldRequest = deferred()
    const extract = vi.mocked(mocks.store!.actions.extractFulltext)
    extract.mockReturnValueOnce(oldRequest.promise)
    await render()
    const oldFrame = container.querySelector('iframe')
    await act(async () => resetLocal())
    // The old reader stays visible during the asynchronous auth-reset window.
    // Both an old request's internal render and an unrelated parent render must
    // retain its old ownership, rather than remounting with a fresh DB generation.
    await act(async () => {
      if (outcome === 'resolve') oldRequest.resolve()
      else oldRequest.reject(new Error('old session failure'))
    })
    expect(container.querySelector('[role="alert"]')).toBeNull()
    await click('Settings')
    await click('Close settings')
    await render()
    expect(container.querySelector('iframe')).toBe(oldFrame)
    expect(extract).toHaveBeenCalledOnce()

    await signInToNewSession()
    expect(container.querySelector('iframe')).not.toBe(oldFrame)
    expect(extract.mock.calls.map(([target]) => target.url)).toEqual([oldItem.url, newItem.url])
  },
)

it('remounts the same selected ID for new-session props and ignores an old-session rejection', async () => {
  const oldRequest = deferred()
  const newRequest = deferred()
  const extract = vi.mocked(mocks.store!.actions.extractFulltext)
  extract.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
  await render()
  const oldFrame = container.querySelector('iframe')
  expect(extractButton().disabled).toBe(true)
  await signInToNewSession()
  expect(container.querySelector('iframe')).not.toBe(oldFrame)
  expect(extract.mock.calls.map(([target]) => target.url)).toEqual([oldItem.url, newItem.url])

  await act(async () => oldRequest.reject(new Error('old session failure')))
  expect(extractButton().disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')).toBeNull()
  await act(async () => newRequest.reject(new Error('new session failure')))
  expect(extractButton().disabled).toBe(false)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('new session failure')
  await render()
  expect(extract).toHaveBeenCalledTimes(2)
})
