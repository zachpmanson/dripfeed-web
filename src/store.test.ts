import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dbClear: vi.fn(async () => {}),
  dbGetItemMutationVersion: vi.fn(() => 0),
  dbPutFeeds: vi.fn(async () => {}),
  dbPutFolders: vi.fn(async () => {}),
  dbPutItems: vi.fn(async () => {}),
  fetchMeta: vi.fn(),
  fetchItems: vi.fn(),
}))

vi.mock('./db', () => ({
  dbClear: mocks.dbClear,
  dbGetItemMutationVersion: mocks.dbGetItemMutationVersion,
  dbPutFeeds: mocks.dbPutFeeds,
  dbPutFolders: mocks.dbPutFolders,
  dbPutItems: mocks.dbPutItems,
}))

vi.mock('./api/sync', () => ({
  fetchMeta: mocks.fetchMeta,
  fetchItems: mocks.fetchItems,
  fetchFeedWindow: vi.fn(),
  fetchInitial: vi.fn(),
  fetchUnreadScope: vi.fn(),
  fetchUpdatedItems: vi.fn(),
  FEED_WINDOW: 20,
}))

vi.mock('./api/news', () => ({ fetchFeedFullText: vi.fn(), fetchItems: mocks.fetchItems }))
vi.mock('./settings', () => ({ clearSettings: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
  mocks.dbClear.mockClear()
  mocks.dbGetItemMutationVersion.mockClear()
  mocks.dbPutFeeds.mockClear()
  mocks.dbPutFolders.mockClear()
  mocks.dbPutItems.mockClear()
  mocks.fetchMeta.mockReset()
  mocks.fetchItems.mockReset()
})

describe('store reset generation', () => {
  it('does not persist an incremental-sync response that arrives after reset', async () => {
    let resolveItems!: (result: { items: never[] }) => void
    mocks.fetchMeta.mockResolvedValue({ feeds: [], folders: [] })
    mocks.fetchItems.mockReturnValue(
      new Promise<{ items: never[] }>((resolve) => {
        resolveItems = resolve
      }),
    )

    vi.stubGlobal('localStorage', { removeItem: vi.fn() })
    const { incrementalSync, resetLocal } = await import('./store')
    const sync = incrementalSync({ baseUrl: '', user: '', appPassword: '' })
    // Let metadata writes finish and incrementalSync reach its deferred item fetch.
    await vi.waitFor(() => expect(mocks.fetchItems).toHaveBeenCalled())

    await resetLocal()
    resolveItems({ items: [] })
    await sync

    expect(mocks.dbClear).toHaveBeenCalledOnce()
    expect(mocks.dbPutItems).not.toHaveBeenCalled()
  })
})
