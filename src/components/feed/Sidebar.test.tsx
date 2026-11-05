// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'
import type { NewsFeed } from '../../api/types'

let root: Root
let container: HTMLDivElement
const onSelect = vi.fn()
const feed = (id: number, title: string, folderId: number | null): NewsFeed =>
  ({ id, title, folderId, unreadCount: 2 }) as NewsFeed
const grouped = feed(1, 'Folder feed', 9)
const ungrouped = feed(2, 'Ungrouped feed', null)

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  onSelect.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
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
        onMetaChanged={vi.fn()}
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

it('does not introduce a Feeds heading when there are no ungrouped feeds', async () => {
  await render([grouped])
  expect(container.querySelector('.folder-head-static')).toBeNull()
  expect(container.querySelector('[data-feed-id="1"]')).not.toBeNull()
  await act(async () => container.querySelector<HTMLButtonElement>('.folder-name-btn')!.click())
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({ kind: 'folder', id: 9 })
})
