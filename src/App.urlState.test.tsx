// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  ensureFeed: vi.fn<(id: number) => Promise<void>>(),
  ensureUnread: vi.fn<(type: number, id: number) => Promise<void>>(),
}))

// Keep the real URL hook and App's network-triggering navigation effects.
vi.mock('./hooks/useListPreferences', () => ({
  default: () => ({ showMode: 'unread', sortMode: 'newest' }),
}))
vi.mock('./hooks/useThemePreferences', () => ({ default: () => ({}) }))
vi.mock('./settings', () => ({
  loadSettings: () => ({ baseUrl: '', user: 'reader', appPassword: 'password' }),
}))
vi.mock('./hooks', () => {
  const actions = { ensureFeed: mocks.ensureFeed, ensureUnread: mocks.ensureUnread }
  const unreadDrained = new Set<string>()
  return { useStore: () => ({ actions, unreadDrained, ready: false, authFailed: false }) }
})
vi.mock('./components/app/SyncGate', () => ({ default: () => null }))

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.ensureFeed.mockReset().mockResolvedValue(undefined)
  mocks.ensureUnread.mockReset().mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function mount() {
  await act(async () => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
}

describe('URL navigation at App network boundaries', () => {
  for (const kind of ['feed', 'folder']) {
    it.each(['NaN', 'Infinity', '-1', '1.5', '9007199254740992'])(
      `never requests invalid ${kind} %s`,
      async (id) => {
        window.history.replaceState(null, '', `/reader?view=${kind}&id=${id}&item=1.5`)
        await mount()
        expect(window.location.search).toBe('?view=all')
        expect(mocks.ensureFeed).not.toHaveBeenCalled()
        expect(mocks.ensureUnread).not.toHaveBeenCalled()
      },
    )
  }

  it('keeps valid feed navigation working even with an invalid item', async () => {
    window.history.replaceState(null, '', '/reader?view=feed&id=7&item=9007199254740992')
    await mount()
    expect(window.location.search).toBe('?view=feed&id=7')
    expect(mocks.ensureFeed.mock.calls).toEqual([[7]])
    expect(mocks.ensureUnread.mock.calls.every(([type, id]) => type === 0 && id === 7)).toBe(true)
    expect(mocks.ensureUnread).toHaveBeenCalled()
  })

  it('never requests an invalid scope restored by back/forward', async () => {
    window.history.replaceState(null, '', '/reader?view=folder&id=Infinity&item=-1')
    window.history.pushState(null, '', '/reader?view=feed&id=7')
    await mount()
    mocks.ensureFeed.mockClear()
    mocks.ensureUnread.mockClear()
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true })
        window.history.back()
      })
    })
    expect(window.location.search).toBe('?view=all')
    expect(mocks.ensureFeed).not.toHaveBeenCalled()
    expect(mocks.ensureUnread).not.toHaveBeenCalled()
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.addEventListener('popstate', () => resolve(), { once: true })
        window.history.forward()
      })
    })
    expect(window.location.search).toBe('?view=feed&id=7')
    expect(mocks.ensureFeed.mock.calls).toEqual([[7]])
    expect(mocks.ensureUnread.mock.calls).toEqual([[0, 7]])
  })
})
