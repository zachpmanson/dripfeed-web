// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Seg } from './Seg'
import { Select } from './Select'
import { IconButton } from './IconButton'
import ErrorToast from '../app/ErrorToast'
import FolderSection from '../feed/FolderSection'
import { SettingsModal } from '../settings/SettingsModal'
import AppHeader from '../app/AppHeader'
import { FeedIcon } from '../feed/FeedIcon'
import { Spinner } from './Spinner'
import type { NewsFeed } from '../../api/types'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
const click = (node: Element) => act(async () => (node as HTMLElement).click())
const byText = (role: string, text: string) =>
  [...document.querySelectorAll(`[role="${role}"]`)].find((node) => node.textContent === text)!

it.each([0, false] as const)(
  'Seg retains mandatory typed %s rather than DOM strings or empty choice',
  async (initial) => {
    const changed = vi.fn()
    function Harness() {
      const [value, setValue] = useState<string | number | boolean>(initial)
      return (
        <Seg
          title="Typed choice"
          value={value}
          onChange={(next) => {
            changed(next)
            setValue(next)
          }}
          options={[
            { value: initial, label: 'First' },
            { value: 'other', label: 'Other' },
          ]}
        />
      )
    }
    await act(async () => root.render(<Harness />))
    await click(byText('radio', 'Other'))
    await click(byText('radio', 'First'))
    expect(changed).toHaveBeenLastCalledWith(initial)
    await click(byText('radio', 'First'))
    expect(document.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(1)
    expect(byText('radio', 'First').getAttribute('aria-checked')).toBe('true')
    expect(document.querySelector('[role="radiogroup"]')?.getAttribute('aria-required')).toBe(
      'true',
    )
  },
)

it('Select emits numeric options, rejects interaction while disabled, and keeps a labelled trigger', async () => {
  const changed = vi.fn()
  const render = (disabled = false) =>
    root.render(
      <Select
        label="Folder"
        value={0}
        onChange={changed}
        disabled={disabled}
        options={[
          { value: 0, label: 'None' },
          { value: 9, label: 'Nine' },
        ]}
      />,
    )
  await act(async () => render())
  expect(
    document
      .querySelector('[role="combobox"] svg.tabler-icon-chevron-down')
      ?.getAttribute('aria-hidden'),
  ).toBe('true')
  expect(document.querySelector('[role="combobox"]')?.textContent).toBe('None')
  await act(async () =>
    document
      .querySelector('[role="combobox"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  )
  await click(byText('option', 'Nine'))
  expect(changed).toHaveBeenCalledExactlyOnceWith(9)
  await act(async () => render(true))
  expect(document.querySelector('[role="combobox"]')?.getAttribute('aria-label')).toBe('Folder')
  expect((document.querySelector('[role="combobox"]') as HTMLButtonElement).disabled).toBe(true)
  await click(document.querySelector('[role="combobox"]')!)
  expect(changed).toHaveBeenCalledOnce()
})

it('IconButton retains a native disabled button and independent accessible label without native title', async () => {
  const action = vi.fn()
  await act(async () =>
    root.render(
      <IconButton title="Helpful label" disabled onClick={action}>
        +
      </IconButton>,
    ),
  )
  const button = document.querySelector('button')!
  expect(button.getAttribute('aria-label')).toBe('Helpful label')
  expect(button.title).toBe('')
  expect(button.disabled).toBe(true)
  expect(button.querySelector('button')).toBeNull()
  await click(button)
  expect(action).not.toHaveBeenCalled()
})

it('Collapsible keeps folder selection separate and delegates controlled disclosure exactly once', async () => {
  const select = vi.fn(),
    toggle = vi.fn()
  const props = {
    folder: { id: 1, parentId: null, name: 'Folder', opened: true },
    feeds: [],
    selected: false,
    selectedFeedId: null,
    onSelectFolder: select,
    onSelectFeed: vi.fn(),
    onToggle: toggle,
    showFavicons: false,
    rarityStats: new Map(),
    menu: {
      folders: [],
      settings: { baseUrl: '', user: 'fixture', appPassword: 'fixture' },
      onChanged: vi.fn(),
      onOpenSettings: vi.fn(),
    },
  }
  await act(async () => root.render(<FolderSection {...props} collapsed />))
  await click(document.querySelector('.folder-name-btn')!)
  expect(select).toHaveBeenCalledOnce()
  expect(toggle).not.toHaveBeenCalled()
  await click(document.querySelector('.caret-btn')!)
  expect(toggle).toHaveBeenCalledExactlyOnceWith(1)
  expect(document.querySelector('.caret-btn')?.getAttribute('aria-expanded')).toBe('false')
  expect(
    document.querySelector('.caret-btn svg.tabler-icon-chevron-down')?.getAttribute('aria-hidden'),
  ).toBe('true')
  await act(async () => root.render(<FolderSection {...props} collapsed={false} />))
  expect(document.querySelector('.caret-btn')?.getAttribute('aria-expanded')).toBe('true')
})

it('Toast projects one external error, replaces rather than queues, and clears only on manual dismissal', async () => {
  const dismiss = vi.fn()
  const render = (error: string | null) =>
    root.render(<ErrorToast error={error} onDismiss={dismiss} />)
  await act(async () => render('First'))
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1)
  const alert = document.querySelector('[role="alert"]')!
  await act(async () =>
    alert.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  )
  expect(dismiss).not.toHaveBeenCalled()
  await act(async () => render('Second'))
  expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1)
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('SecondDismiss')
  await click(document.querySelector('[aria-label="Dismiss error"]')!)
  expect(dismiss).toHaveBeenCalledOnce()
  await act(async () => render(null))
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

it('Settings preference checkbox callbacks stay strictly boolean and labelled', async () => {
  const changed = [vi.fn(), vi.fn(), vi.fn()]
  const render = (checked = true) =>
    root.render(
      <SettingsModal
        feeds={[]}
        folders={[]}
        uiTheme="dark"
        articleCssMode="default"
        articleCss=""
        showFavicons={checked}
        singleClickRead={checked}
        dimBoilerplate={checked}
        onUiTheme={vi.fn()}
        onArticleCssMode={vi.fn()}
        onArticleCss={vi.fn()}
        onShowFavicons={changed[0]}
        onSingleClickRead={changed[1]}
        onDimBoilerplate={changed[2]}
        onLogout={vi.fn()}
        onClose={vi.fn()}
      />,
    )
  await act(async () => render())
  const checkboxes = [...document.querySelectorAll('[role="checkbox"]')]
  expect(checkboxes).toHaveLength(3)
  expect(
    document.querySelector('[aria-label="close"] svg.tabler-icon-x')?.getAttribute('aria-hidden'),
  ).toBe('true')
  expect(
    document.querySelector('.repo-link svg.tabler-icon-external-link')?.getAttribute('aria-hidden'),
  ).toBe('true')
  for (const [index, checkbox] of checkboxes.entries()) {
    expect(checkbox.closest('label')?.textContent?.trim().length).toBeGreaterThan(3)
    expect(checkbox.querySelector('svg.tabler-icon-check')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
    await click(checkbox)
    expect(changed[index]).toHaveBeenCalledExactlyOnceWith(false)
    expect(checkbox.getAttribute('aria-checked')).not.toBe('mixed')
  }
  await act(async () => render(false))
  for (const [index, checkbox] of checkboxes.entries()) {
    expect(checkbox.getAttribute('aria-checked')).toBe('false')
    expect(checkbox.querySelector('svg.tabler-icon-check')).toBeNull()
    await click(checkbox)
    expect(changed[index]).toHaveBeenLastCalledWith(true)
  }
})

it('header uses decorative Tabler chrome and retains refresh state and actions', async () => {
  const onSync = vi.fn(),
    onAdd = vi.fn(),
    onSettings = vi.fn()
  const render = (syncing: boolean) =>
    root.render(
      <AppHeader
        showMode="all"
        onShowModeChange={vi.fn()}
        sortMode="newest"
        onSortModeChange={vi.fn()}
        syncing={syncing}
        poolLength={42}
        onSync={onSync}
        onAdd={onAdd}
        onSettings={onSettings}
      />,
    )
  await act(async () => render(false))
  for (const [label, icon, action] of [
    ['Refresh now — re-sync newest items, feeds and folders (42 local)', 'refresh', onSync],
    ['Add feed or folder', 'plus', onAdd],
    ['Settings', 'settings', onSettings],
  ] as const) {
    const button = document.querySelector('[aria-label="' + label + '"]')!
    const svg = button.querySelector('svg.tabler-icon-' + icon)!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('stroke-width')).toBe('2')
    expect(button.textContent).toBe('')
    await click(button)
    expect(action).toHaveBeenCalledOnce()
  }
  expect(document.querySelector('.sync')?.classList.contains('syncing')).toBe(false)
  await act(async () => render(true))
  expect(document.querySelector('.sync')?.classList.contains('syncing')).toBe(true)
  expect(document.querySelector('.sync svg.spinner.tabler-icon-refresh')).not.toBeNull()
  await act(async () => root.render(<Spinner />))
  expect(
    container.querySelector('svg.spinner.tabler-icon-refresh')?.getAttribute('aria-hidden'),
  ).toBe('true')
  expect(container.textContent).toBe('')
})

it('feed icons preserve external branding and dimensions, falling back to decorative Tabler RSS', async () => {
  const feed = { title: 'Example', faviconLink: 'https://fixture.invalid/brand.png' } as NewsFeed
  await act(async () => root.render(<FeedIcon feed={feed} size={14} />))
  const image = container.querySelector('img')!
  expect(image.getAttribute('src')).toBe(feed.faviconLink)
  expect(image.getAttribute('alt')).toBe('')
  expect(image.getAttribute('width')).toBe('14')
  expect(image.getAttribute('height')).toBe('14')
  expect(container.querySelector('svg')).toBeNull()
  await act(async () => image.dispatchEvent(new Event('error')))
  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('.feed-icon.fallback')?.getAttribute('aria-hidden')).toBe('true')
  expect(container.querySelector<HTMLElement>('.feed-icon')?.style.width).toBe('14px')
  expect(container.querySelector('svg.tabler-icon-rss')?.getAttribute('aria-hidden')).toBe('true')
  expect(container.textContent).toBe('')
  await act(async () =>
    root.render(<FeedIcon key="missing" feed={{ ...feed, faviconLink: null }} />),
  )
  expect(container.querySelector('svg.tabler-icon-rss')).not.toBeNull()
  expect(container.querySelector<HTMLElement>('.feed-icon')?.style.width).toBe('16px')
})
