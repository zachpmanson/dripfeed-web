// @vitest-environment jsdom
/// <reference types="vite/client" />
import newspaperCss from '../../index.css?raw'
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
    expect(container.querySelector('li')?.classList.contains(`newspaper-${role}`)).toBe(true)
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

it.each(['lead', 'feature', 'brief', 'image', 'standard'] as const)(
  'uses the same bottom separator and spacing for %s stories',
  async (role) => {
    await render(item, role)
    const tile = container.querySelector('li')!
    expect(tile.classList.contains('border-b')).toBe(true)
    expect(tile.classList.contains('border-app-border')).toBe(true)
    expect(tile.classList.contains('pb-6')).toBe(true)
    expect(tile.classList.contains('mb-6')).toBe(true)
    expect(tile.classList.contains('[break-inside:avoid-column]')).toBe(true)
    expect(tile.classList.contains('[column-span:all]')).toBe(role === 'lead')
  },
)

it('does not introduce role-specific side rules into the newspaper columns', () => {
  // Source-style invariant only, not a computed browser layout assertion.
  expect(newspaperCss).not.toMatch(
    /\.newspaper[^{}]*\{[^{}]*\bborder-(?:inline-(?:start|end)|left|right)\s*:/,
  )
})

it('varies excerpt lengths without truncating headlines or adding unsafe markup', async () => {
  const story = { ...item, title: 'A complete headline', body: `<p>${'word '.repeat(150)}</p>` }
  await render(story, 'brief')
  expect(container.querySelector('p')!.textContent!.length).toBeLessThanOrEqual(161)
  await render(story, 'feature')
  expect(container.querySelector('p')!.textContent!.length).toBeGreaterThan(160)
  expect(container.querySelector('[data-story-id]')!.textContent).toBe(story.title)
})

it('uses native balanced columns capped at three, not a measured row grid', () => {
  // Source invariants only: jsdom does not perform multicol layout.
  const columns = newspaperCss.match(/\.newspaper\s*\{([^}]+)\}/)![1]
  expect(columns).toMatch(/columns:\s*17rem 3;/)
  expect(columns).toMatch(/column-gap:\s*1.75rem;/)
  expect(columns).not.toMatch(/\b(?:height|max-height|grid[^:;]*):/)
  expect(newspaperCss).not.toMatch(/grid-auto-rows:/)
  expect(newspaperCss).toMatch(/\.newspaper > li:not\(\.newspaper-story\)\s*\{\s*column-span: all;/)
  expect(newspaperCss).toMatch(/\.newspaper-feature \.newspaper-headline\s*\{\s*font-size: clamp\(/)
})

it('bounds the lead image height without enlarging later column images', async () => {
  await render()
  expect(container.querySelector('img')?.parentElement?.classList.contains('max-h-80')).toBe(true)
  await render(item, 'feature')
  expect(container.querySelector('img')?.parentElement?.classList.contains('max-h-80')).toBe(false)
})
