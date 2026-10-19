// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { View } from './views'
import App from './App'

const mocks = vi.hoisted(() => ({
  view: { kind: 'feed', id: 1 } as View,
  ensureFeed: vi.fn<(feedId: number) => Promise<void>>(),
}))

vi.mock('./hooks/useUrlState', () => ({
  default: () => ({ view: mocks.view }),
}))
vi.mock('./hooks/useListPreferences', () => ({
  default: () => ({ showMode: 'all', sortMode: 'newest' }),
}))
vi.mock('./hooks/useThemePreferences', () => ({ default: () => ({}) }))
vi.mock('./settings', () => ({
  loadSettings: () => ({ baseUrl: '', user: 'reader', appPassword: 'password' }),
}))
vi.mock('./hooks', () => {
  const actions = { ensureFeed: mocks.ensureFeed }
  return { useStore: () => ({ actions, ready: false, authFailed: false }) }
})
vi.mock('./components/app/SyncGate', () => ({ default: () => null }))

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.view = { kind: 'feed', id: 1 }
  mocks.ensureFeed.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function render(view = mocks.view) {
  mocks.view = view
  await act(async () => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}

describe('feed navigation refill', () => {
  it('refills destination B even while A is pending, without requiring another navigation', async () => {
    const a = deferred()
    const b = deferred()
    mocks.ensureFeed.mockImplementation((id) => (id === 1 ? a.promise : b.promise))

    await render()
    expect(mocks.ensureFeed.mock.calls).toEqual([[1]])
    await render({ kind: 'feed', id: 2 })

    await act(async () => a.resolve())
    // A's pool refresh can rerender App, but does not change the effect dependencies.
    await render()
    expect(mocks.ensureFeed.mock.calls).toEqual([[1], [2]])
    await act(async () => b.resolve())
    await render()
    expect(mocks.ensureFeed.mock.calls).toEqual([[1], [2]])
  })

  it('deduplicates pending revisits per feed and only releases the completed feed', async () => {
    const a = deferred()
    const b = deferred()
    mocks.ensureFeed.mockImplementation((id) => (id === 1 ? a.promise : b.promise))

    await render()
    await render({ kind: 'feed', id: 2 })
    expect(mocks.ensureFeed.mock.calls).toEqual([[1], [2]])
    await render({ kind: 'feed', id: 1 })
    expect(mocks.ensureFeed).toHaveBeenCalledTimes(2)

    await act(async () => b.resolve())
    await render({ kind: 'folder', id: 1 })
    await render({ kind: 'feed', id: 1 })
    expect(mocks.ensureFeed).toHaveBeenCalledTimes(2)

    await act(async () => a.resolve())
    await render()
    expect(mocks.ensureFeed).toHaveBeenCalledTimes(2)
    await render({ kind: 'folder', id: 1 })
    await render({ kind: 'feed', id: 1 })
    expect(mocks.ensureFeed.mock.calls).toEqual([[1], [2], [1]])
  })

  it('does not automatically retry a store-reported failure, but allows a later visit to retry', async () => {
    const request = deferred()
    const reportError = vi.fn()
    mocks.ensureFeed.mockImplementation(async () => {
      // useStore catches and reports refill errors instead of rejecting to App.
      try {
        await request.promise
      } catch (error) {
        reportError(error)
      }
    })

    await render()
    await act(async () => request.reject(new Error('refill failed')))
    expect(reportError).toHaveBeenCalledOnce()
    await render()
    expect(mocks.ensureFeed).toHaveBeenCalledOnce()

    await render({ kind: 'folder', id: 1 })
    await render({ kind: 'feed', id: 1 })
    expect(mocks.ensureFeed.mock.calls).toEqual([[1], [1]])
  })
})
