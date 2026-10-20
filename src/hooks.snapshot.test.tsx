// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReaderSnapshot } from './db'
import { ApiError } from './api/client'
import { useStore, type AppData } from './hooks'
import type { View } from './views'

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn<() => Promise<ReaderSnapshot>>(),
  initialized: vi.fn<() => Promise<boolean>>(),
  incremental: vi.fn<() => Promise<void>>(),
  fullSync: vi.fn<() => Promise<void>>(),
  reset: vi.fn<() => Promise<void>>(),
  ensureFeed: vi.fn<() => Promise<void>>(),
  listeners: new Set<() => void>(),
}))

vi.mock('./db', () => ({ dbGetReaderSnapshot: mocks.snapshot }))
vi.mock('./actions', () => ({ setRead: vi.fn(), setStar: vi.fn(), extractFulltext: vi.fn() }))
vi.mock('./store', () => ({
  isInitialized: mocks.initialized,
  isDbReady: () => false,
  markDbReady: vi.fn(),
  fullSync: mocks.fullSync,
  incrementalSync: mocks.incremental,
  resetLocal: mocks.reset,
  ensureFeedWindow: mocks.ensureFeed,
  loadMoreInto: vi.fn(),
  ensureUnreadScope: vi.fn(),
  unreadScopeKey: (type: number, id: number) => `${type}:${id}`,
  getStatus: () => ({ stage: 'idle', done: 0 }),
  onStoreChange: (listener: () => void) => {
    mocks.listeners.add(listener)
    return () => mocks.listeners.delete(listener)
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function snapshot(generation: number): ReaderSnapshot {
  return {
    items: [null, 20, 20, 10].map((pubDate, index) => ({
      id: generation * 10 + index,
      guid: '',
      guidHash: '',
      url: '',
      title: `generation ${generation}`,
      author: null,
      pubDate,
      updatedDate: null,
      body: '',
      enclosureMime: null,
      enclosureLink: null,
      mediaThumbnail: null,
      mediaDescription: null,
      feedId: generation,
      unread: false,
      starred: false,
      filtered: false,
      lastModified: 0,
      rtl: false,
      intro: null,
      fingerprint: null,
      categories: [],
      sharedBy: null,
      sharedByDisplayName: null,
    })),
    feeds: [
      {
        id: generation,
        title: `generation ${generation}`,
        url: '',
        faviconLink: null,
        added: 0,
        folderId: generation,
        unreadCount: 0,
        ordering: 0,
        link: null,
        pinned: false,
        fullTextEnabled: false,
        updateErrorCount: 0,
        lastUpdateError: null,
      },
    ],
    folders: [{ id: generation, parentId: null, name: `generation ${generation}`, opened: true }],
    cursors: new Map([[generation, -1]]),
  }
}

const settings = { baseUrl: '', user: 'test', appPassword: 'test' }
let root: Root
let container: HTMLDivElement
let data: AppData
let renders: AppData[]

function Harness({ view = { kind: 'all' }, enabled = true }: { view?: View; enabled?: boolean }) {
  data = useStore(enabled ? settings : null, view, false)
  renders.push(data)
  return null
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.listeners.clear()
  mocks.snapshot.mockReset()
  mocks.initialized.mockReset().mockResolvedValue(true)
  mocks.incremental.mockReset().mockReturnValue(new Promise(() => {}))
  mocks.fullSync.mockReset().mockResolvedValue(undefined)
  mocks.reset.mockReset().mockResolvedValue(undefined)
  mocks.ensureFeed.mockReset().mockResolvedValue(undefined)
  renders = []
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function emitChange() {
  await act(async () => {
    for (const listener of mocks.listeners) listener()
  })
}

function expectGeneration(generation: number) {
  expect(data.ready).toBe(true)
  expect(data.pool.map((item) => item.id)).toEqual([
    generation * 10 + 1,
    generation * 10 + 2,
    generation * 10 + 3,
    generation * 10,
  ])
  expect([...data.feeds.keys()]).toEqual([generation])
  expect(data.folders.map((folder) => folder.id)).toEqual([generation])
  expect(data.cursors).toEqual(new Map([[generation, -1]]))
}

it('publishes sorted data, cursors and readiness together, preserving them across views', async () => {
  const read = deferred<ReaderSnapshot>()
  mocks.snapshot.mockReturnValue(read.promise)
  await act(async () => root.render(<Harness />))
  expect(data.ready).toBe(false)
  expect(data.pool).toEqual([])
  await act(async () => read.resolve(snapshot(1)))
  expectGeneration(1)
  expect(renders.every((render) => render.ready === render.pool.length > 0)).toBe(true)
  await act(async () => root.render(<Harness view={{ kind: 'feed', id: 1 }} />))
  expectGeneration(1)
  await act(async () => root.render(<Harness view={{ kind: 'folder', id: 1 }} />))
  expectGeneration(1)
  expect(mocks.snapshot).toHaveBeenCalledOnce()
})

it('never lets an older overlapping refresh overwrite the newest completed snapshot', async () => {
  mocks.snapshot.mockResolvedValueOnce(snapshot(1))
  await act(async () => root.render(<Harness />))
  const older = deferred<ReaderSnapshot>()
  const newer = deferred<ReaderSnapshot>()
  mocks.snapshot.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
  await emitChange()
  expectGeneration(1)
  await emitChange()
  await act(async () => newer.resolve(snapshot(3)))
  expectGeneration(3)
  await act(async () => older.resolve(snapshot(2)))
  expectGeneration(3)
  // Every committed render has matching data and cursor generations.
  for (const render of renders.filter((render) => render.ready)) {
    const generation = render.pool[0].feedId
    expect([...render.feeds.keys()]).toEqual([generation])
    expect(render.folders[0].id).toBe(generation)
    expect([...render.cursors.keys()]).toEqual([generation])
    expect(generation).not.toBe(2)
  }
})

it('does not publish readiness when the initial read is superseded by a pending refresh', async () => {
  const initial = deferred<ReaderSnapshot>()
  const newer = deferred<ReaderSnapshot>()
  mocks.snapshot.mockReturnValueOnce(initial.promise).mockReturnValueOnce(newer.promise)
  await act(async () => root.render(<Harness />))
  await emitChange()
  await act(async () => initial.resolve(snapshot(1)))
  expect(data.ready).toBe(false)
  expect(data.pool).toEqual([])
  await act(async () => newer.resolve(snapshot(2)))
  expectGeneration(2)
})

it('keeps readiness false during full hydration until a completed snapshot is available', async () => {
  mocks.initialized.mockResolvedValue(false)
  const sync = deferred<void>()
  const read = deferred<ReaderSnapshot>()
  mocks.fullSync.mockReturnValue(sync.promise)
  mocks.snapshot.mockReturnValue(read.promise)
  await act(async () => root.render(<Harness />))
  expect(mocks.snapshot).not.toHaveBeenCalled()
  expect(data.ready).toBe(false)
  await act(async () => sync.resolve())
  expect(data.ready).toBe(false)
  await act(async () => read.resolve(snapshot(1)))
  expectGeneration(1)
})

it.each(['manual', 'auth'])(
  'invalidates reads across %s reset and old async work',
  async (kind) => {
    mocks.snapshot.mockResolvedValueOnce(snapshot(1))
    await act(async () => root.render(<Harness />))
    const read = deferred<ReaderSnapshot>()
    const reset = deferred<void>()
    const refill = deferred<void>()
    mocks.snapshot.mockReturnValueOnce(read.promise)
    mocks.reset.mockReturnValue(reset.promise)
    mocks.ensureFeed.mockReturnValue(refill.promise)
    await emitChange()
    let refillDone!: Promise<void>
    let resetDone!: Promise<void>
    await act(async () => {
      refillDone = data.actions.ensureFeed(1)
      if (kind === 'auth') {
        mocks.incremental.mockRejectedValueOnce(new ApiError('Not authorized', 401))
        resetDone = data.actions.refreshMeta()
      } else {
        resetDone = data.actions.reset()
      }
    })
    await act(async () => read.resolve(snapshot(2)))
    expectGeneration(1)
    await act(async () => {
      reset.resolve()
      await resetDone
      refill.resolve()
      await refillDone
    })
    expect(data.ready).toBe(false)
    expect(data.pool).toEqual([])
    expect(data.feeds.size).toBe(0)
    expect(data.folders).toEqual([])
    expect(data.cursors.size).toBe(0)
    expect(data.authFailed).toBe(kind === 'auth')
    await emitChange()
    expect(mocks.snapshot).toHaveBeenCalledTimes(2)
  },
)

it('invalidates reads on settings cleanup and survives StrictMode initialization', async () => {
  const read = deferred<ReaderSnapshot>()
  mocks.snapshot.mockReturnValue(read.promise)
  await act(async () =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    ),
  )
  expect(mocks.snapshot).toHaveBeenCalledOnce()
  await act(async () =>
    root.render(
      <StrictMode>
        <Harness enabled={false} />
      </StrictMode>,
    ),
  )
  await act(async () => read.resolve(snapshot(1)))
  expect(data.ready).toBe(false)
  expect(data.pool).toEqual([])
})
