// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'
import type { NewsFeed } from '../../api/types'
import * as news from '../../api/news'

let root: Root
let container: HTMLDivElement
const onSelect = vi.fn()
const onMetaChanged = vi.fn()
const feed = (id: number, title: string, folderId: number | null): NewsFeed =>
  ({ id, title, folderId, unreadCount: 2 }) as NewsFeed
const grouped = feed(1, 'Folder feed', 9)
const ungrouped = feed(2, 'Ungrouped feed', null)

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  onSelect.mockClear()
  onMetaChanged.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const render = async (feeds: NewsFeed[]) =>
  act(async () =>
    root.render(
      <Sidebar
        feeds={new Map(feeds.map((entry) => [entry.id, entry]))}
        folders={[{ id: 9, name: 'Folder', parentId: null, opened: true }]}
        items={[]}
        view={{ kind: 'all' }}
        onSelect={onSelect}
        settings={{ baseUrl: '', user: 'fixture', appPassword: 'fixture' }}
        showFavicons={false}
        rarityStats={new Map()}
        onMetaChanged={onMetaChanged}
      />,
    ),
  )

it('gives ungrouped feeds a quiet, non-interactive heading aligned with sidebar rows', async () => {
  await render([ungrouped, grouped])
  const heading = container.querySelector<HTMLHeadingElement>('.folder-head-static')!
  expect(heading.tagName).toBe('H2')
  expect(heading.textContent?.trim()).toBe('Feeds')
  // Utility/structure wiring only: jsdom does not establish visual alignment.
  for (const name of ['m-0', 'mb-0.5', 'font-normal', 'text-app-muted']) {
    expect(heading.classList.contains(name)).toBe(true)
  }
  const folderButton = container.querySelector('.folder-name-btn')!
  for (const name of ['px-2.5', 'py-1.5', 'text-sm']) {
    expect(heading.classList.contains(name)).toBe(true)
    expect(folderButton.classList.contains(name)).toBe(true)
  }
  expect(heading.tabIndex).toBe(-1)
  expect(heading.closest('button')).toBeNull()
  expect(heading.hasAttribute('aria-expanded')).toBe(false)
  expect(heading.querySelector('svg')).toBeNull()
  await act(async () => heading.click())
  expect(onSelect).not.toHaveBeenCalled()

  const rows = [...container.querySelectorAll<HTMLButtonElement>('[data-feed-id]')]
  expect(rows.map((row) => row.dataset.feedId)).toEqual(['1', '2'])
  expect(rows[1].parentElement?.firstElementChild).toBe(heading)
  await act(async () => rows[1].click())
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ kind: 'feed', id: 2 })
})

it('adds a feed from an empty folder with the destination preselected, then refreshes and closes', async () => {
  const create = vi.spyOn(news, 'createFeed').mockResolvedValue({ feeds: [] })
  await render([])
  const folder = container.querySelector<HTMLButtonElement>('[data-folder-id="9"]')!
  await act(async () =>
    folder.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }),
    ),
  )
  const add = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (node) => node.textContent?.trim() === 'Add feed…',
  )!
  await act(async () => add.click())
  expect(onSelect).not.toHaveBeenCalled()
  expect(document.querySelector('[role="menu"]')).toBeNull()
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(document.querySelector('[role="combobox"]')?.textContent).toContain('Folder')
  const url = document.querySelector<HTMLInputElement>('input[type="url"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      url,
      'https://example.com/feed',
    )
    url.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
  expect(create).toHaveBeenCalledExactlyOnceWith(
    { baseUrl: '', user: 'fixture', appPassword: 'fixture' },
    'https://example.com/feed',
    9,
    undefined,
  )
  expect(onMetaChanged).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(folder)
})

it('a dismissed pending create refreshes metadata without closing a reopened same-folder form', async () => {
  let resolve!: (value: { feeds: NewsFeed[] }) => void
  const request = new Promise<{ feeds: NewsFeed[] }>((yes) => {
    resolve = yes
  })
  vi.spyOn(news, 'createFeed').mockReturnValue(request)
  await render([])
  const openAdd = async () => {
    await act(async () =>
      container
        .querySelector('[data-folder-id="9"]')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }),
        ),
    )
    const add = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (node) => node.textContent?.trim() === 'Add feed…',
    )!
    await act(async () => add.click())
  }
  const fillUrl = async (value: string) => {
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>('input[type="url"]')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  await openAdd()
  await fillUrl('https://example.com/old-feed')
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.app-dialog [aria-label="close"]')!.click(),
  )
  await openAdd()
  await fillUrl('https://example.com/new-feed')
  await act(async () => resolve({ feeds: [] }))
  expect(onMetaChanged).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(document.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe(
    'https://example.com/new-feed',
  )
})

it('does not introduce a Feeds heading when there are no ungrouped feeds', async () => {
  await render([grouped])
  expect(container.querySelector('.folder-head-static')).toBeNull()
  expect(container.querySelector('[data-feed-id="1"]')).not.toBeNull()
  await act(async () => container.querySelector<HTMLButtonElement>('.folder-name-btn')!.click())
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ kind: 'folder', id: 9 })
})
