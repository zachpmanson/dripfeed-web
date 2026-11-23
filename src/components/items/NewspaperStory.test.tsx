// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NewsItem } from '../../api/types'
import NewspaperStory from './NewspaperStory'
import type { NewspaperRole } from './newspaperPresentation'

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

const render = async (story = item, role: NewspaperRole = 'lead') => {
  const onSelect = vi.fn(),
    onRead = vi.fn(),
    onStar = vi.fn()
  await act(async () =>
    root.render(
      <ul>
        <NewspaperStory
          item={story}
          role={role}
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

it('places story actions beside feed metadata above the headline, without footer duplicates', async () => {
  await render({ ...item, pubDate: 1000, unread: true }, 'lead')
  const article = container.querySelector('article')!
  const header = article.firstElementChild!
  expect(header.tagName).toBe('HEADER')
  expect(article.getAttribute('dir')).toBe('rtl')
  expect(header.getAttribute('dir')).toBe('ltr')
  // Structure/utility wiring only, not native right-edge or pixel geometry.
  expect(header.classList.contains('justify-between')).toBe(true)
  expect(header.classList.contains('items-start')).toBe(true)
  const metadata = header.firstElementChild!
  expect(metadata.getAttribute('dir')).toBe('auto')
  expect(metadata.textContent).toContain('Feed')
  expect(metadata.querySelector('time')).not.toBeNull()
  expect(metadata.classList.contains('min-h-[16px]')).toBe(true)
  expect(metadata.classList.contains('min-w-0')).toBe(true)
  const actions = header.lastElementChild!
  expect(actions.classList.contains('shrink-0')).toBe(true)
  expect(actions.querySelectorAll('button')).toHaveLength(2)
  expect(actions.querySelector('[aria-label="Star: Headline"]')).not.toBeNull()
  expect(actions.querySelector('[aria-label="Mark read: Headline"]')).not.toBeNull()
  expect(article.children.item(1)?.tagName).toBe('H2')
  expect(article.querySelectorAll('button')).toHaveLength(3)
  expect(article.querySelector('[class~="mt-4"]')).toBeNull()
})

it('falls back after an image error, retries changed metadata and omits brief images', async () => {
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
  await render(item, 'brief')
  expect(container.querySelector('img')).toBeNull()
  expect(container.textContent).not.toContain('Image unavailable')
})

it.each(['feature', 'image'] as const)(
  'uses safe metadata on %s tiles with the same broken-image fallback',
  async (role) => {
    await render(item, role)
    expect(container.querySelector('li')?.classList.contains('[column-span:all]')).toBe(false)
    const image = container.querySelector('img')!
    expect(image.getAttribute('src')).toBe('https://fixture.invalid/image.png')
    if (role === 'image') {
      expect(
        image.compareDocumentPosition(container.querySelector('p')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
    await act(async () => image.dispatchEvent(new Event('error')))
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('Image unavailable')
    await render(
      {
        ...item,
        mediaThumbnail: 'javascript:bad',
        enclosureMime: 'audio/mp3',
        body: '<img src="https://never.invalid/body"><p>Safe</p>',
      },
      role,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).not.toContain('Image unavailable')
    expect(container.querySelector('p')?.textContent).toBe('Safe')
  },
)

it('renders a longer excerpt for feature and lead stories without truncating the headline', async () => {
  const story = { ...item, title: 'A complete headline', body: `<p>${'word '.repeat(150)}</p>` }
  const excerptLength = () => container.querySelector('p')!.textContent!.length
  await render(story, 'brief')
  const briefLength = excerptLength()
  expect(briefLength).toBeLessThanOrEqual(161)
  await render(story, 'feature')
  const featureLength = excerptLength()
  expect(featureLength).toBeGreaterThan(briefLength)
  expect(container.querySelector('[data-story-id]')!.textContent).toBe(story.title)
  await render(story, 'lead')
  expect(excerptLength()).toBeGreaterThan(featureLength)
})

it('keeps Star and read toggles labelled and wired to the current story', async () => {
  await render()
  const star = container.querySelector<HTMLButtonElement>('[aria-label="Star: Headline"]')!
  expect(star.textContent).toBe('')
  const read = container.querySelector<HTMLButtonElement>('[aria-label="Mark unread: Headline"]')!
  expect(read.textContent).toBe('')
  expect(read.hasAttribute('aria-pressed')).toBe(false)
  expect(read.querySelector('svg.tabler-icon-circle')?.getAttribute('aria-hidden')).toBe('true')
  expect(star.querySelector('svg.tabler-icon-star')?.getAttribute('aria-hidden')).toBe('true')
  const changed = { ...item, starred: true, unread: true }
  const { onStar, onRead } = await render(changed)
  const unstar = container.querySelector<HTMLButtonElement>('[aria-label="Unstar: Headline"]')!
  expect(unstar.textContent).toBe('')
  expect(unstar.getAttribute('aria-pressed')).toBe('true')
  expect(unstar.querySelector('svg.tabler-icon-star-filled')?.getAttribute('aria-hidden')).toBe(
    'true',
  )
  expect(unstar.querySelector('svg.tabler-icon-star')).toBeNull()
  await act(async () => unstar.click())
  expect(onStar).toHaveBeenCalledExactlyOnceWith(changed)
  const unread = container.querySelector<HTMLButtonElement>('[aria-label="Mark read: Headline"]')!
  expect(unread.querySelector('svg.tabler-icon-circle-filled')?.getAttribute('aria-hidden')).toBe(
    'true',
  )
  expect(unread.querySelector('svg.tabler-icon-circle')).toBeNull()
  expect(unread.textContent).toBe('')
  await act(async () => unread.click())
  expect(onRead).toHaveBeenCalledExactlyOnceWith(changed)
})

it.each(['Star', 'Mark unread'])(
  'keeps the full long-title %s label in its shared tooltip',
  async (action) => {
    const title = 'A long headline '.repeat(30).trim()
    await render({ ...item, title })
    const label = `${action}: ${title}`
    const button = [...container.querySelectorAll('button')].find(
      (node) => node.getAttribute('aria-label') === label,
    )!
    expect(button.textContent).toBe('')
    expect(button.title).toBe('')
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      button.focus()
    })
    await act(async () => {
      await vi.waitFor(() => {
        const tooltip = document.getElementById(button.getAttribute('aria-describedby')!)
        expect(tooltip?.getAttribute('role')).toBe('tooltip')
        expect(tooltip?.textContent).toBe(label)
      })
    })
  },
)
