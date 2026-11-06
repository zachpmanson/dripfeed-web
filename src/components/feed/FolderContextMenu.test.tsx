// @vitest-environment jsdom
import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FolderContextMenu } from './FolderContextMenu'
import { renameFolder } from '../../api/news'

vi.mock('../../api/news', () => ({ renameFolder: vi.fn() }))
const settings = { baseUrl: '', user: 'fixture', appPassword: 'fixture' }
const folder = { id: 9, name: 'Example', parentId: null, opened: true }
const changed = vi.fn(),
  addFeed = vi.fn(),
  select = vi.fn()
let root: Root, container: HTMLDivElement
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <StrictMode>
        <FolderContextMenu
          folder={folder}
          settings={settings}
          onChanged={changed}
          onAddFeed={addFeed}
        >
          <button data-folder-id="9" onClick={select}>
            Example
          </button>
        </FolderContextMenu>
      </StrictMode>,
    ),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})
const item = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (node) => node.textContent?.trim() === label,
  )!
const click = (node: HTMLElement) => act(async () => node.click())
const open = (key = 'ContextMenu') =>
  act(async () =>
    container.querySelector('[data-folder-id]')!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        shiftKey: key === 'F10',
        bubbles: true,
        cancelable: true,
      }),
    ),
  )
const escape = () =>
  act(async () =>
    document
      .querySelector('[role="menu"]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
  )

it.each(['ContextMenu', 'F10'])(
  'opens with %s without selecting, dismisses to the folder',
  async (key) => {
    await open(key)
    expect(select).not.toHaveBeenCalled()
    expect(document.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe(
      'Actions for folder Example',
    )
    expect(item('Rename')).toBeDefined()
    expect(item('Add feed…')).toBeDefined()
    expect(container.querySelector('button button')).toBeNull()
    await escape()
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(container.querySelector('[data-folder-id]'))
  },
)

it('validates rename, retains errors for retry, trims names and refreshes once', async () => {
  vi.spyOn(window, 'prompt')
    .mockReturnValueOnce(null)
    .mockReturnValueOnce(' ')
    .mockReturnValueOnce(' Example ')
    .mockReturnValue(' New name ')
  vi.mocked(renameFolder)
    .mockRejectedValueOnce(new Error('Rename failed'))
    .mockResolvedValue(undefined)
  await open()
  for (let i = 0; i < 3; i++) await click(item('Rename'))
  expect(renameFolder).not.toHaveBeenCalled()
  await click(item('Rename'))
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Rename failed')
  expect(changed).not.toHaveBeenCalled()
  await click(item('Rename'))
  expect(renameFolder).toHaveBeenLastCalledWith(settings, 9, 'New name')
  expect(changed).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="menu"]')).toBeNull()
})

it('blocks duplicate renames and add-feed while pending, isolates dismissed requests', async () => {
  let resolve!: () => void
  vi.spyOn(window, 'prompt').mockReturnValue('New name')
  vi.mocked(renameFolder).mockReturnValue(
    new Promise<void>((yes) => {
      resolve = yes
    }),
  )
  await open()
  await click(item('Rename'))
  await click(item('Rename'))
  await click(item('Add feed…'))
  expect(renameFolder).toHaveBeenCalledExactlyOnceWith(settings, 9, 'New name')
  expect(addFeed).not.toHaveBeenCalled()
  await escape()
  await open()
  await act(async () => resolve())
  expect(changed).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="menu"]')).not.toBeNull()
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

it('hands add-feed to the parent without selecting or retaining the menu', async () => {
  await open()
  await click(item('Add feed…'))
  expect(addFeed).toHaveBeenCalledOnce()
  expect(select).not.toHaveBeenCalled()
  expect(document.querySelector('[role="menu"]')).toBeNull()
})
