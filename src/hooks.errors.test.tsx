// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError } from './api/client'
import { useStore, type AppData } from './hooks'
import { ItemView } from './components/reader/ItemView'
import ErrorToast from './components/app/ErrorToast'
import type { NewsItem } from './api/types'

const mocks = vi.hoisted(() => ({
  generation: 0,
  extract: vi.fn(),
  read: vi.fn(),
  star: vi.fn(),
  sync: vi.fn(),
  reset: vi.fn(),
}))
vi.mock('./actions', () => ({
  extractFulltext: mocks.extract,
  setRead: mocks.read,
  setStar: mocks.star,
}))
vi.mock('./db', () => ({
  dbGetGeneration: () => mocks.generation,
  dbGetReaderSnapshot: async () => ({ items: [], feeds: [], folders: [], cursors: new Map() }),
}))
vi.mock('./store', () => ({
  isInitialized: async () => true,
  isDbReady: () => true,
  markDbReady: vi.fn(),
  incrementalSync: mocks.sync,
  fullSync: vi.fn(),
  resetLocal: mocks.reset,
  onStoreChange: () => () => {},
  getStatus: () => ({ stage: 'idle' }),
  loadMoreInto: vi.fn(),
  ensureFeedWindow: vi.fn(),
  ensureUnreadScope: vi.fn(),
  unreadScopeKey: (type: number, id: number) => `${type}:${id}`,
}))

const settings = { baseUrl: '', user: 'reader', appPassword: 'password' }
const selected = {
  id: 42,
  title: 'Article',
  url: 'https://example.com/article',
  body: 'Summary',
  feedId: 1,
} as NewsItem
let data: AppData
let root: Root
let container: HTMLDivElement

function Harness({
  auto = false,
  item = selected,
  credentials = settings as typeof settings | null,
}: {
  auto?: boolean
  item?: NewsItem
  credentials?: typeof settings | null
}) {
  data = useStore(credentials, { kind: 'all' }, false)
  return (
    <>
      <button id="background">Background control</button>
      <ErrorToast error={data.error} onDismiss={data.actions.clearError} />
      <ItemView
        item={item}
        actions={data.actions}
        feedTitle={() => 'Feed'}
        articleCssMode="default"
        articleCss=""
        dimBoilerplate={false}
        recentBodies={[]}
        autoExtract={auto}
        onFeedClick={() => {}}
      />
    </>
  )
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.resetAllMocks()
  mocks.generation += 1
  mocks.sync.mockResolvedValue(undefined)
  mocks.reset.mockImplementation(async () => {
    mocks.generation += 1
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function deferred() {
  let reject!: (error: Error) => void
  const promise = new Promise<void>((_, fail) => (reject = fail))
  return { promise, reject }
}

it.each([false, true])(
  'keeps extraction failure local (automatic=%s), with manual retry',
  async (auto) => {
    const failure = new Error('Could not extract an article from this URL')
    mocks.extract.mockRejectedValue(failure)
    await act(async () => root.render(<Harness auto={auto} />))
    const extract = () =>
      container.querySelector<HTMLButtonElement>('button[title^="Extract full article"]')!
    if (!auto) await act(async () => extract().click())
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(container.querySelector('article [role="alert"]')?.textContent).toContain(
      failure.message,
    )
    expect(data.error).toBeNull()
    expect(extract().disabled).toBe(false)
    await act(async () => root.render(<Harness auto={auto} item={{ ...selected }} />))
    expect(mocks.extract).toHaveBeenCalledOnce()
    await act(async () => extract().click())
    expect(mocks.extract).toHaveBeenCalledTimes(2)
    await act(async () => {
      await expect(data.actions.extractFulltext(selected)).rejects.toBe(failure)
    })
    expect(data.error).toBeNull()
  },
)

it.each(['network', 'server', 'rate limit'])(
  'rejects non-auth extraction %s failures without a toast',
  async (kind) => {
    const failure =
      kind === 'network'
        ? new TypeError('offline')
        : new ApiError(kind, kind === 'server' ? 500 : 429)
    mocks.extract.mockRejectedValue(failure)
    await act(async () => root.render(<Harness />))
    await act(async () => {
      await expect(data.actions.extractFulltext(selected)).rejects.toBe(failure)
    })
    expect(data.error).toBeNull()
    expect(data.authFailed).toBe(false)
    expect(mocks.reset).not.toHaveBeenCalled()
  },
)

it('preserves real extraction 401 reset and rejection, clearing a previous global error', async () => {
  mocks.star.mockRejectedValue(new Error('Star failed'))
  await act(async () => root.render(<Harness />))
  await act(async () => {
    await expect(data.actions.setStar(selected, true)).rejects.toThrow('Star failed')
  })
  const failure = new ApiError('Unauthorized', 401)
  mocks.extract.mockRejectedValue(failure)
  await act(async () => {
    await expect(data.actions.extractFulltext(selected)).rejects.toBe(failure)
  })
  expect(mocks.reset).toHaveBeenCalledOnce()
  expect(data.authFailed).toBe(true)
  expect(data.error).toBeNull()
})

it('toasts unrelated errors without focus theft, deduplicates dismissal and permits a different error', async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    ),
  )
  const background = container.querySelector<HTMLButtonElement>('#background')!
  background.focus()
  mocks.sync.mockRejectedValue(new Error('Sync failed'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await act(async () => data.actions.syncNow())
  const toast = container.querySelector('[role="alert"]')!
  expect(toast.textContent).toContain('Sync failed')
  expect(toast.className).toContain('fixed')
  expect(document.activeElement).toBe(background)
  await act(async () =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    ),
  )
  expect(container.querySelector('[role="alert"]')).toBe(toast)
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Dismiss error"]')!.click(),
  )
  expect(data.error).toBeNull()
  await act(async () => data.actions.refreshMeta())
  expect(container.querySelector('[role="alert"]')).toBeNull()
  mocks.read.mockRejectedValue(new Error('Read failed'))
  await act(async () => {
    await expect(data.actions.setRead(selected, false)).rejects.toThrow('Read failed')
  })
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Read failed')
  await act(async () => data.actions.reset())
  expect(container.querySelector('[role="alert"]')).toBeNull()
  await act(async () => root.render(<Harness credentials={null} />))
  await act(async () => root.render(<Harness credentials={{ ...settings }} />))
  mocks.sync.mockResolvedValue(undefined)
  mocks.read.mockRejectedValue(new Error('Read failed'))
  await act(async () => {
    await expect(data.actions.setRead(selected, false)).rejects.toThrow('Read failed')
  })
  expect(data.error).toBe('Read failed')
  vi.restoreAllMocks()
})

it.each([401, 500])(
  'ignores an old-session %s rejection after logout/new login',
  async (status) => {
    const pending = deferred()
    mocks.extract.mockReturnValueOnce(pending.promise)
    await act(async () => root.render(<Harness />))
    const failure = new ApiError('Old session', status)
    let request!: Promise<void>
    await act(async () => {
      request = data.actions.extractFulltext(selected)
    })
    const rejected = expect(request).rejects.toBe(failure)
    await act(async () => data.actions.reset())
    await act(async () => root.render(<Harness credentials={null} />))
    await act(async () => root.render(<Harness credentials={{ ...settings }} />))
    await act(async () => {
      pending.reject(failure)
      await rejected
    })
    expect(data.error).toBeNull()
    expect(data.authFailed).toBe(false)
    expect(mocks.reset).toHaveBeenCalledOnce()
  },
)

it('does not put a late automatic extraction error on another article', async () => {
  const pending = deferred()
  mocks.extract.mockReturnValueOnce(pending.promise)
  await act(async () => root.render(<Harness auto />))
  await act(async () => root.render(<Harness item={{ ...selected, id: 43 }} />))
  await act(async () => pending.reject(new Error('Previous article failed')))
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(data.error).toBeNull()
})

it('ignores stale global failures after reset and unmount, including a late 401', async () => {
  const read = deferred()
  mocks.read.mockReturnValueOnce(read.promise)
  await act(async () => root.render(<Harness />))
  let request!: Promise<void>
  await act(async () => {
    request = data.actions.setRead(selected, false)
  })
  const rejected = expect(request).rejects.toThrow('Old read')
  await act(async () => data.actions.reset())
  await act(async () => root.render(<Harness credentials={null} />))
  await act(async () => root.render(<Harness credentials={{ ...settings }} />))
  await act(async () => {
    read.reject(new Error('Old read'))
    await rejected
  })
  expect(data.error).toBeNull()

  const extraction = deferred()
  mocks.extract.mockReturnValueOnce(extraction.promise)
  await act(async () => {
    request = data.actions.extractFulltext(selected)
  })
  const authRejected = expect(request).rejects.toThrow('Old auth')
  await act(async () => root.render(null))
  await act(async () => {
    extraction.reject(new ApiError('Old auth', 401))
    await authRejected
  })
  expect(mocks.reset).toHaveBeenCalledOnce()
})

it('does not re-toast a dismissed error on ordinary background polls', async () => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    mocks.sync.mockRejectedValue(new Error('Poll failed'))
    await act(async () => root.render(<Harness />))
    expect(data.error).toBe('Poll failed')
    await act(async () => data.actions.clearError())
    await act(async () => vi.advanceTimersByTimeAsync(3 * 60_000))
    expect(mocks.sync).toHaveBeenCalledTimes(2)
    expect(data.error).toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  } finally {
    vi.useRealTimers()
    vi.restoreAllMocks()
  }
})
