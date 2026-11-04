// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NewsItem } from '../../api/types'
import NewspaperStory from './NewspaperStory'

let root: Root, container: HTMLDivElement
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

const item = {
  id: 1,
  feedId: 1,
  title: 'Headline',
  body: '<p>Excerpt</p>',
  url: 'https://fixture.invalid/story',
  unread: false,
  starred: false,
  rtl: true,
  mediaThumbnail: '/image.png',
} as NewsItem

const render = async (story = item, lead = true) => {
  const onSelect = vi.fn(),
    onRead = vi.fn(),
    onStar = vi.fn()
  await act(async () =>
    root.render(
      <ul>
        <NewspaperStory
          item={story}
          lead={lead}
          feedTitle={() => 'Feed'}
          singleClickRead
          onSelect={onSelect}
          onRead={onRead}
          onStar={onStar}
        />
      </ul>,
    ),
  )
  return { onSelect, onRead, onStar }
}

it('inherits read/unread headline color, retains RTL, and uses focusable native action buttons', async () => {
  const { onSelect, onRead, onStar } = await render()
  const headline = container.querySelector<HTMLButtonElement>('[data-story-id]')!
  expect(headline.tagName).toBe('BUTTON')
  expect(headline.tabIndex).toBe(0)
  expect(headline.classList.contains('text-inherit')).toBe(true)
  expect(headline.closest('h2')?.classList.contains('text-app-muted')).toBe(true)
  expect(headline.closest('article')?.getAttribute('dir')).toBe('rtl')
  await act(async () => headline.focus())
  expect(document.activeElement).toBe(headline)
  // jsdom click checks wiring only; native Enter/Space activation is browser-owned.
  await act(async () => headline.click())
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(item.id)
  expect(onRead).not.toHaveBeenCalled()
  const star = container.querySelector<HTMLButtonElement>('[aria-label="Star: Headline"]')!
  expect(star.getAttribute('aria-pressed')).toBe('false')
  await act(async () => star.click())
  expect(onStar).toHaveBeenCalledExactlyOnceWith(item)
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Mark unread: Headline"]')!.click(),
  )
  expect(onRead).toHaveBeenCalledExactlyOnceWith(item)

  await render({ ...item, unread: true, rtl: false })
  expect(headline.closest('h2')?.classList.contains('text-app-text')).toBe(true)
  expect(headline.closest('article')?.getAttribute('dir')).toBe('auto')
})

it('falls back after an image error, retries changed metadata and omits non-lead images', async () => {
  await render()
  const image = container.querySelector('img')!
  expect(image.getAttribute('alt')).toBe('')
  expect(image.getAttribute('referrerpolicy')).toBe('no-referrer')
  await act(async () => image.dispatchEvent(new Event('error')))
  expect(container.querySelector('img')).toBeNull()
  expect(container.textContent).toContain('Image unavailable')
  await render()
  expect(container.querySelector('img')).toBeNull()
  await render({ ...item, mediaThumbnail: '/replacement.png' })
  expect(container.querySelector('img')?.getAttribute('src')).toBe(
    'https://fixture.invalid/replacement.png',
  )
  await render(item, false)
  expect(container.querySelector('img')).toBeNull()
  expect(container.textContent).not.toContain('Image unavailable')
})
