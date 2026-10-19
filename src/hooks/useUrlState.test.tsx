// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useUrlState from './useUrlState'

let root: Root
let container: HTMLDivElement
let navigation: ReturnType<typeof useUrlState>

function Harness() {
  navigation = useUrlState()
  return null
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.history.replaceState(null, '', '/reader?view=all')
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

async function mount() {
  await act(async () => {
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    )
  })
}

// Exercise jsdom's actual asynchronous history traversal, not just a synthetic popstate.
async function traverse(direction: 'back' | 'forward') {
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.addEventListener('popstate', () => resolve(), { once: true })
      window.history[direction]()
    })
  })
}

const invalidIds = [
  '',
  ' ',
  'NaN',
  'Infinity',
  '-Infinity',
  'nope',
  '0',
  '-1',
  '1.5',
  '9007199254740992',
  '9007199254740993',
]

describe('initial URL cleanup', () => {
  for (const kind of ['feed', 'folder']) {
    it.each(invalidIds)(
      `replaces invalid ${kind} %j without exposing an invalid ID`,
      async (id) => {
        const params = new URLSearchParams({ view: kind, id, item: '7', keep: 'yes' })
        window.history.replaceState({ retained: true }, '', `/reader?${params}#article`)
        const length = window.history.length
        const push = vi.spyOn(window.history, 'pushState')
        const replace = vi.spyOn(window.history, 'replaceState')
        await mount()
        expect(navigation.view).toEqual({ kind: 'all' })
        expect(navigation.selectedId).toBe(7)
        expect(window.location.search).toBe('?view=all&item=7&keep=yes')
        expect(window.location.hash).toBe('#article')
        expect(window.history.state).toEqual({ retained: true })
        expect(window.history.length).toBe(length)
        expect(push).not.toHaveBeenCalled()
        expect(replace).toHaveBeenCalledOnce()
      },
    )
  }

  it.each(invalidIds)('replaces invalid item %j without changing a valid view', async (item) => {
    const params = new URLSearchParams({ view: 'folder', id: '2', item })
    window.history.replaceState(null, '', `/reader?${params}`)
    const push = vi.spyOn(window.history, 'pushState')
    await mount()
    expect(navigation.view).toEqual({ kind: 'folder', id: 2 })
    expect(navigation.selectedId).toBeNull()
    expect(window.location.search).toBe('?view=folder&id=2')
    expect(push).not.toHaveBeenCalled()
  })

  it.each([
    ['/reader#top', '?view=all', { kind: 'all' }, null],
    ['/reader?view=feed#top', '?view=all', { kind: 'all' }, null],
    ['/reader?view=folder#top', '?view=all', { kind: 'all' }, null],
    ['/reader?view=unknown&id=5#top', '?view=all', { kind: 'all' }, null],
    [
      '/reader?view=feed&id=001&item=2e1#top',
      '?view=feed&id=1&item=20',
      { kind: 'feed', id: 1 },
      20,
    ],
  ])('replaces noncanonical %s', async (url, search, view, selectedId) => {
    window.history.replaceState(null, '', url)
    const length = window.history.length
    const push = vi.spyOn(window.history, 'pushState')
    await mount()
    expect(navigation.view).toEqual(view)
    expect(navigation.selectedId).toBe(selectedId)
    expect(window.location.search).toBe(search)
    expect(window.location.hash).toBe('#top')
    expect(window.history.length).toBe(length)
    expect(push).not.toHaveBeenCalled()
  })

  it('does not rewrite an already canonical URL', async () => {
    window.history.replaceState(null, '', '/reader?view=feed&id=1&item=2#top')
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    await mount()
    expect(navigation.view).toEqual({ kind: 'feed', id: 1 })
    expect(navigation.selectedId).toBe(2)
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('browser navigation', () => {
  it('pushes one entry per navigation and restores view/item on back and forward', async () => {
    window.history.replaceState(null, '', '/reader?keep=yes&view=feed&id=1&item=10#top')
    await mount()
    const length = window.history.length
    const push = vi.spyOn(window.history, 'pushState')
    await act(async () => {
      navigation.setView({ kind: 'folder', id: 2 })
      navigation.setSelectedId(null)
    })
    expect(window.location.search).toBe('?keep=yes&view=folder&id=2')
    expect(push).toHaveBeenCalledOnce()
    await act(async () => navigation.setSelectedId(20))
    expect(push).toHaveBeenCalledTimes(2)
    expect(window.history.length).toBe(length + 2)
    expect(window.location.hash).toBe('#top')

    await traverse('back')
    expect(navigation.view).toEqual({ kind: 'folder', id: 2 })
    expect(navigation.selectedId).toBeNull()
    await traverse('back')
    expect(navigation.view).toEqual({ kind: 'feed', id: 1 })
    expect(navigation.selectedId).toBe(10)
    await traverse('forward')
    expect(navigation.view).toEqual({ kind: 'folder', id: 2 })
    expect(navigation.selectedId).toBeNull()
    await traverse('forward')
    expect(navigation.selectedId).toBe(20)
    expect(push).toHaveBeenCalledTimes(2)
    expect(window.history.length).toBe(length + 2)
  })

  it.each(['feed', 'folder'])(
    'cleans a malformed %s history entry without truncating forward history',
    async (kind) => {
      window.history.replaceState(
        null,
        '',
        `/reader?view=${kind}&id=Infinity&item=1.5&keep=yes#top`,
      )
      window.history.pushState(null, '', '/reader?view=starred&item=30#next')
      await mount()
      const length = window.history.length
      const push = vi.spyOn(window.history, 'pushState')
      const replace = vi.spyOn(window.history, 'replaceState')
      await traverse('back')
      expect(navigation.view).toEqual({ kind: 'all' })
      expect(navigation.selectedId).toBeNull()
      expect(window.location.search).toBe('?view=all&keep=yes')
      expect(window.location.hash).toBe('#top')
      expect(push).not.toHaveBeenCalled()
      expect(replace).toHaveBeenCalledOnce()
      await traverse('forward')
      expect(navigation.view).toEqual({ kind: 'starred' })
      expect(navigation.selectedId).toBe(30)
      expect(window.location.hash).toBe('#next')
      expect(push).not.toHaveBeenCalled()
      expect(window.history.length).toBe(length)
    },
  )

  it('does not add entries for equivalent updates, and supports functional setters', async () => {
    await mount()
    const push = vi.spyOn(window.history, 'pushState')
    await act(async () => {
      navigation.setView((view) => view)
      navigation.setSelectedId((id) => id)
    })
    expect(push).not.toHaveBeenCalled()
    await act(async () => navigation.setView({ kind: 'allUnread' }))
    await act(async () => navigation.setView({ kind: 'starred' }))
    expect(push).toHaveBeenCalledTimes(2)
    expect(window.location.search).toBe('?view=starred')
  })
})
