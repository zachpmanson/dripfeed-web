// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FeedContextMenu } from './FeedContextMenu'
import { deleteFeed, moveFeed, renameFeed } from '../../api/news'
import { markFeedAllRead } from '../../actions'
import { copyText } from '../../utils'
import type { NewsFeed } from '../../api/types'

vi.mock('../../api/news', () => ({ deleteFeed: vi.fn(), moveFeed: vi.fn(), renameFeed: vi.fn() }))
vi.mock('../../actions', () => ({ markFeedAllRead: vi.fn() }))
vi.mock('../../utils', () => ({ copyText: vi.fn() }))
const settings = { baseUrl: '', user: 'fixture', appPassword: 'fixture' }
const feed = {
  id: 42,
  title: 'Example',
  unreadCount: 3,
  url: 'https://fixture.invalid/feed',
  link: null,
} as NewsFeed
let root: Root, container: HTMLDivElement
let changed: ReturnType<typeof vi.fn<() => void>>
let openSettings: ReturnType<typeof vi.fn<(feed: NewsFeed) => void>>
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  changed = vi.fn()
  openSettings = vi.fn()
  await act(async () =>
    root.render(
      <FeedContextMenu
        feed={feed}
        menu={{
          folders: [{ id: 9, parentId: null, name: 'Nine', opened: true }],
          settings,
          onChanged: changed,
          onOpenSettings: openSettings,
        }}
      >
        <button data-feed-id="42">Example</button>
      </FeedContextMenu>,
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
const open = () =>
  act(async () =>
    document
      .querySelector('[data-feed-id]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }),
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
function pending() {
  let resolve!: () => void, reject!: (e: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

it('guards duplicate writes, retains failure, retries mark-read and refreshes once', async () => {
  const request = pending()
  vi.mocked(markFeedAllRead).mockReturnValueOnce(request.promise).mockResolvedValue(undefined)
  await open()
  await click(item('Mark all as read'))
  await click(item('Mark all as read'))
  expect(markFeedAllRead).toHaveBeenCalledExactlyOnceWith(settings, 42)
  await act(async () => request.reject(new Error('Failure')))
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Failure')
  await click(item('Mark all as read'))
  expect(markFeedAllRead).toHaveBeenCalledTimes(2)
  expect(changed).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="menu"]')).toBeNull()
})

it('preserves native rename validation, delete cancellation, API payloads and visible retry errors', async () => {
  const prompt = vi
    .spyOn(window, 'prompt')
    .mockReturnValueOnce(null)
    .mockReturnValueOnce(' ')
    .mockReturnValueOnce('Example')
    .mockReturnValue(' Renamed ')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await open()
  for (let i = 0; i < 3; i++) await click(item('Rename'))
  expect(renameFeed).not.toHaveBeenCalled()
  await click(item('Delete'))
  expect(deleteFeed).not.toHaveBeenCalled()
  vi.mocked(renameFeed)
    .mockRejectedValueOnce(new Error('Rename failed'))
    .mockResolvedValue(undefined)
  await click(item('Rename'))
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Rename failed')
  await click(item('Rename'))
  expect(renameFeed).toHaveBeenLastCalledWith(settings, 42, 'Renamed')
  expect(prompt).toHaveBeenCalledWith('Rename feed "Example":', 'Example')
  await open()
  confirm.mockReturnValue(true)
  vi.mocked(deleteFeed)
    .mockRejectedValueOnce(new Error('Delete failed'))
    .mockResolvedValue(undefined)
  await click(item('Delete'))
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Delete failed')
  await click(item('Delete'))
  expect(deleteFeed).toHaveBeenLastCalledWith(settings, 42)
})

it('moves numeric/null destinations through a managed submenu and retains failed move for retry', async () => {
  vi.mocked(moveFeed).mockRejectedValueOnce(new Error('Move failed')).mockResolvedValue(undefined)
  await open()
  await act(async () =>
    item('Move to folder…').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    ),
  )
  await click(item('Nine'))
  expect(moveFeed).toHaveBeenLastCalledWith(settings, 42, 9)
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Move failed')
  await click(item('No folder'))
  expect(moveFeed).toHaveBeenLastCalledWith(settings, 42, null)
  expect(changed).toHaveBeenCalledOnce()
})

it('old clipboard and mutation completions cannot dismiss or modify a newly reopened same-feed menu', async () => {
  const copy = pending()
  vi.mocked(copyText).mockReturnValue(copy.promise)
  await open()
  await click(item('Copy feed url'))
  await click(item('Copy feed url'))
  expect(copyText).toHaveBeenCalledExactlyOnceWith(feed.url)
  await escape()
  await open()
  await act(async () => copy.resolve())
  expect(item('Copy feed url')).toBeDefined()
  expect(item('Copied')).toBeUndefined()
  const write = pending()
  vi.mocked(markFeedAllRead).mockReturnValue(write.promise)
  await click(item('Mark all as read'))
  await escape()
  await open()
  await act(async () => write.resolve())
  expect(document.querySelector('[role="menu"]')).not.toBeNull()
  expect(changed).toHaveBeenCalledOnce()
})

it('hands settings ownership to the parent and shows a copy error without closing', async () => {
  vi.mocked(copyText).mockRejectedValue(new Error('Clipboard failed'))
  await open()
  await click(item('Copy feed url'))
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Clipboard failed')
  await click(item('Feed settings…'))
  expect(openSettings).toHaveBeenCalledExactlyOnceWith(feed)
  expect(document.querySelector('[role="menu"]')).toBeNull()
})

it.each(['root', 'submenu'])(
  'right-click inside %s suppresses native context menu and dismisses the app menu',
  async (target) => {
    await open()
    if (target === 'submenu') {
      await act(async () =>
        item('Move to folder…').dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
        ),
      )
    }
    const menus = document.querySelectorAll('[role="menu"]')
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
    await act(async () => menus[target === 'root' ? 0 : 1].dispatchEvent(event))
    expect(event.defaultPrevented).toBe(true)
    expect(document.querySelector('[role="menu"]')).toBeNull()
  },
)

it('settings can outlive a pending mutation without a stale close or focus job', async () => {
  const request = pending()
  vi.mocked(markFeedAllRead).mockReturnValue(request.promise)
  await open()
  await click(item('Mark all as read'))
  await click(item('Feed settings…'))
  expect(openSettings).toHaveBeenCalledExactlyOnceWith(feed)
  await open()
  await act(async () => request.resolve())
  expect(document.querySelector('[role="menu"]')).not.toBeNull()
})
