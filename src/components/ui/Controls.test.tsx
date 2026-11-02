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
  await act(async () =>
    root.render(
      <SettingsModal
        feeds={[]}
        folders={[]}
        uiTheme="dark"
        articleCssMode="default"
        articleCss=""
        showFavicons
        singleClickRead
        dimBoilerplate
        onUiTheme={vi.fn()}
        onArticleCssMode={vi.fn()}
        onArticleCss={vi.fn()}
        onShowFavicons={changed[0]}
        onSingleClickRead={changed[1]}
        onDimBoilerplate={changed[2]}
        onLogout={vi.fn()}
        onClose={vi.fn()}
      />,
    ),
  )
  const checkboxes = [...document.querySelectorAll('[role="checkbox"]')]
  expect(checkboxes).toHaveLength(3)
  for (const [index, checkbox] of checkboxes.entries()) {
    expect(checkbox.closest('label')?.textContent?.trim().length).toBeGreaterThan(3)
    await click(checkbox)
    expect(changed[index]).toHaveBeenCalledExactlyOnceWith(false)
    expect(checkbox.getAttribute('aria-checked')).not.toBe('mixed')
  }
})
