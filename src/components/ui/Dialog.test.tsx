// @vitest-environment jsdom
import { act, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'
import { SettingsModal } from '../settings/SettingsModal'
import { AddModal } from '../feed/AddModal'
import { FeedSettingsModal } from '../feed/FeedSettingsModal'
import type { NewsFeed } from '../../api/types'
import type { Settings } from '../../settings'
import { createFeed, createFolder } from '../../api/news'
import { setFeedFullText } from '../../actions'

vi.mock('../../api/news', () => ({ createFeed: vi.fn(), createFolder: vi.fn() }))
vi.mock('../../actions', () => ({ setFeedFullText: vi.fn() }))
const settings: Settings = { baseUrl: '', user: 'reader', appPassword: 'test' }
const feed = { id: 42, title: 'Example', fullTextEnabled: false } as NewsFeed
let root: Root
let container: HTMLDivElement
let opener: HTMLButtonElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  // jsdom does not implement native modality, focus navigation, inertness or
  // layout. These shims test our wiring only; Chromium tests cover the platform.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = true
        this.querySelector<HTMLElement>('button, input')?.focus()
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = false
      }),
    },
  })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  container = document.createElement('div')
  opener = document.createElement('button')
  document.body.append(opener, container)
  opener.focus()
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  opener.remove()
  vi.restoreAllMocks()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
const click = async (element: HTMLElement) => act(async () => element.click())
const button = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((b) => b.textContent === text)!
const dialog = () => document.querySelector('dialog')!
const name = () => document.getElementById(dialog().getAttribute('aria-labelledby')!)!.textContent
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit() {
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}
function pending() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

it('uses showModal, traps edge Tabs with current enabled controls, dismisses on cancel and restores focus in StrictMode', async () => {
  function Harness() {
    const [open, setOpen] = useState(true)
    return (
      open && (
        <Dialog labelledBy="title" onClose={() => setOpen(false)}>
          <span id="title">Test dialog</span>
          <button>First</button>
          <button disabled>Disabled</button>
          <button>Last</button>
        </Dialog>
      )
    )
  }
  await act(async () =>
    root.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    ),
  )
  expect(dialog().open).toBe(true)
  expect(name()).toBe('Test dialog')
  expect(dialog().getAttribute('aria-modal')).toBe('true')
  expect(document.activeElement).toBe(button('First'))
  const tab = (shiftKey = false) =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
    )
  tab(true)
  expect(document.activeElement).toBe(button('Last'))
  tab()
  expect(document.activeElement).toBe(button('First'))
  button('Last').disabled = true
  tab(true)
  expect(document.activeElement).toBe(button('First'))
  const cancel = new Event('cancel', { cancelable: true })
  await act(async () => dialog().dispatchEvent(cancel))
  expect(cancel.defaultPrevented).toBe(true)
  expect(dialog()).toBeNull()
  expect(document.activeElement).toBe(opener)
})

it('does not dismiss on content clicks or a drag from content to backdrop; backdrop press+click dismisses', async () => {
  const close = vi.fn()
  await act(async () =>
    root.render(
      <Dialog labelledBy="title" onClose={close}>
        <span id="title">Title</span>
        <button>Inside</button>
      </Dialog>,
    ),
  )
  vi.spyOn(dialog(), 'getBoundingClientRect').mockReturnValue({
    left: 10,
    top: 10,
    right: 100,
    bottom: 100,
  } as DOMRect)
  await click(button('Inside'))
  dialog().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 }))
  await click(dialog())
  expect(close).not.toHaveBeenCalled()
  dialog().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }))
  await click(dialog())
  expect(close).toHaveBeenCalledOnce()
})

it('names Settings and labels/describes custom CSS without changing its live value callback', async () => {
  const change = vi.fn()
  await act(async () =>
    root.render(
      <SettingsModal
        feeds={[]}
        folders={[]}
        uiTheme="dark"
        articleCssMode="custom"
        articleCss="p {}"
        showFavicons
        singleClickRead
        dimBoilerplate
        onUiTheme={vi.fn()}
        onArticleCssMode={vi.fn()}
        onArticleCss={change}
        onShowFavicons={vi.fn()}
        onSingleClickRead={vi.fn()}
        onDimBoilerplate={vi.fn()}
        onLogout={vi.fn()}
        onClose={vi.fn()}
      />,
    ),
  )
  expect(name()).toBe('Settings')
  const textarea = document.querySelector('textarea')!
  expect(textarea.labels![0].textContent).toBe('Custom article CSS')
  expect(
    document.getElementById(textarea.getAttribute('aria-describedby')!)!.textContent,
  ).toContain('Applied live')
  expect(textarea.value).toBe('p {}')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      textarea,
      'a {}',
    )
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(change).toHaveBeenCalledWith('a {}')
})

it('preserves Add feed/folder submission, busy, errors and switch focus', async () => {
  const request = pending()
  vi.mocked(createFeed).mockReturnValue(request.promise as never)
  vi.mocked(createFolder).mockResolvedValue({} as never)
  const created = vi.fn()
  await act(async () =>
    root.render(
      <AddModal settings={settings} folders={[]} onClose={vi.fn()} onCreated={created} />,
    ),
  )
  expect(name()).toBe('Add')
  const url = document.querySelector<HTMLInputElement>('input[type=url]')!
  expect(document.activeElement).toBe(url)
  await input(url, 'https://example.com/feed')
  await submit()
  expect(createFeed).toHaveBeenCalledWith(settings, 'https://example.com/feed', null)
  expect(button('Adding…').disabled).toBe(true)
  await submit()
  expect(createFeed).toHaveBeenCalledOnce()
  await act(async () => request.reject(new Error('Feed failed')))
  expect(document.querySelector('.error')!.textContent).toBe('Feed failed')
  expect(button('Add feed').disabled).toBe(false)
  await click(button('Folder'))
  const folder = document.querySelector<HTMLInputElement>('input[type=text]')!
  expect(document.activeElement).toBe(folder)
  await input(folder, 'New folder')
  await submit()
  expect(createFolder).toHaveBeenCalledWith(settings, 'New folder')
  expect(created).toHaveBeenCalledWith('folder')
  expect(folder.value).toBe('')
  expect(document.querySelector('.ok')!.textContent).toBe('Folder created.')
})

it('preserves feed toggle busy/rollback/success and restores its persistent row instead of the removed menu', async () => {
  opener.dataset.feedId = '42'
  const menuItem = document.createElement('button')
  document.body.append(menuItem)
  menuItem.focus()
  const request = pending()
  vi.mocked(setFeedFullText).mockReturnValue(request.promise)
  const changed = vi.fn()
  await act(async () =>
    root.render(
      <FeedSettingsModal feed={feed} settings={settings} onClose={vi.fn()} onChanged={changed} />,
    ),
  )
  menuItem.remove()
  expect(name()).toBe('Feed settings — Example')
  const checkbox = document.querySelector<HTMLInputElement>('input')!
  await click(checkbox)
  expect(checkbox.checked).toBe(true)
  expect(checkbox.disabled).toBe(true)
  expect(setFeedFullText).toHaveBeenCalledWith(settings, 42, true)
  await act(async () => request.reject(new Error('Write failed')))
  expect(checkbox.checked).toBe(false)
  expect(checkbox.disabled).toBe(false)
  expect(document.querySelector('.error')!.textContent).toBe('Write failed')
  vi.mocked(setFeedFullText).mockResolvedValue(undefined)
  await click(checkbox)
  expect(changed).toHaveBeenCalledOnce()
  await act(async () => root.render(null))
  expect(document.activeElement).toBe(opener)
})
