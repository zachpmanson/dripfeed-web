// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { NewsItem } from '../../api/types'
import {
  plainExcerpt,
  previewExcerpt,
  previewImage,
  previewTitle,
  safeImageUrl,
} from './newspaperPreview'

describe('inert newspaper previews', () => {
  it('removes executable, hidden and boilerplate content and keeps block spacing/entities', () => {
    const html =
      '<script>bad()</script><style>bad{}</style><nav>Menu</nav><footer>Subscribe</footer><aside>Ads</aside><p>Hello &amp; welcome</p><p>Next<br>line<img src="https://never.invalid/image" onerror="bad()"></p><iframe src="https://never.invalid"></iframe><span hidden>secret</span>'
    expect(plainExcerpt(html)).toBe('Hello & welcome Next line')
    expect(document.querySelector('img, iframe, script')).toBeNull()
  })
  it('handles malformed markup, empty articles, Unicode and bounded text', () => {
    expect(plainExcerpt('<p>One<b> two')).toBe('One two')
    expect(plainExcerpt('<img src=x>')).toBe('')
    expect(plainExcerpt('😀😀😀', 2)).toBe('😀😀…')
    expect(previewExcerpt({ intro: '<style>bad</style>', body: '<p>Body</p>' } as NewsItem)).toBe(
      'Body',
    )
  })
  it('caps HTML parsing before text extraction, including very large boilerplate prefixes', () => {
    expect(
      plainExcerpt(`<script>${'x'.repeat(100_000)}</script><p>Beyond the parsing budget</p>`),
    ).toBe('')
    expect(plainExcerpt(`<p>Opening</p>${'word '.repeat(100_000)}`, 12)).toBe('Opening word…')
    expect(document.querySelector('script')).toBeNull()
  })
  it('uses inert bounded fallback headlines for untitled or empty items', () => {
    expect(
      previewTitle({
        title: '',
        body: '<script>bad()</script><p>A safe sentence. Next</p><img src="https://never.invalid/image">',
      } as NewsItem),
    ).toBe('A safe sentence.')
    expect(previewTitle({ title: '', body: '<img src=x>' } as NewsItem)).toBe('(untitled)')
    expect(previewTitle({ title: 'Headline', body: 'Unused' } as NewsItem)).toBe('Headline')
  })
  it('prefers a usable intro without using full body text', () => {
    expect(previewExcerpt({ intro: '<p>Intro</p>', body: 'Body' } as NewsItem)).toBe('Intro')
  })
})

describe('metadata-only image URLs', () => {
  it.each([
    'javascript:alert(1)',
    'data:image/png,x',
    'file:///tmp/a',
    'blob:https://example.org/id',
    'https://user:pass@example.org/a',
  ])('rejects %s', (url) => {
    expect(safeImageUrl(url, 'https://example.org/story')).toBeNull()
  })
  it('resolves HTTP(S) relative and protocol-relative URLs and rejects unsafe bases', () => {
    expect(safeImageUrl('../image.png', 'https://example.org/posts/story')).toBe(
      'https://example.org/image.png',
    )
    expect(safeImageUrl('//images.example.org/a', 'https://example.org/story')).toBe(
      'https://images.example.org/a',
    )
    expect(safeImageUrl('relative.png', 'javascript:bad')).toBeNull()
    expect(safeImageUrl('https://example.org/a', '')).toBe('https://example.org/a')
    expect(safeImageUrl(' ', 'https://example.org')).toBeNull()
  })
  it('prefers thumbnails then image enclosures; never scrapes body images', () => {
    const item = {
      url: 'https://example.org/story',
      mediaThumbnail: '/thumb',
      enclosureLink: '/full',
      enclosureMime: 'image/jpeg',
      body: '<img src="/body">',
    } as NewsItem
    expect(previewImage(item)).toBe('https://example.org/thumb')
    expect(previewImage({ ...item, mediaThumbnail: 'javascript:bad' })).toBe(
      'https://example.org/full',
    )
    expect(previewImage({ ...item, mediaThumbnail: null, enclosureMime: 'audio/mp3' })).toBeNull()
  })
})
