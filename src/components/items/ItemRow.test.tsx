import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { NewsItem } from '../../api/types'
import ItemRow from './ItemRow'

const item: NewsItem = {
  id: 1,
  guid: '1',
  guidHash: '1',
  url: 'https://example.com/article',
  title: 'Article title',
  author: null,
  pubDate: null,
  updatedDate: null,
  body: '',
  enclosureMime: null,
  enclosureLink: null,
  mediaThumbnail: null,
  mediaDescription: null,
  feedId: 1,
  unread: true,
  starred: false,
  filtered: false,
  lastModified: 0,
  rtl: false,
  intro: null,
  fingerprint: null,
  categories: [],
  sharedBy: null,
  sharedByDisplayName: null,
}

it.each([true, false])('uses title colour without an unread dot (unread=%s)', (unread) => {
  const html = renderToStaticMarkup(
    <ItemRow
      item={{ ...item, unread }}
      selected={false}
      feedTitle={() => 'Example feed'}
      showFavicons={false}
      singleClickRead={false}
      onSelect={vi.fn()}
      onRead={vi.fn()}
      rarityMode={false}
    />,
  )

  expect(html).not.toContain('unread-dot')
  const title = html.match(/<div class="item-title([^"]*)">([^<]*)<\/div>/)!
  expect(title).not.toBeNull()
  expect(title[2]).toBe('Article title')
  expect(title[1].includes('text-app-muted')).toBe(!unread)
})

it.each([true, false])(
  'uses a decorative Tabler filled star only for starred items (%s)',
  (starred) => {
    const html = renderToStaticMarkup(
      <ItemRow
        item={{ ...item, starred }}
        selected={false}
        feedTitle={() => 'Feed'}
        showFavicons={false}
        singleClickRead={false}
        onSelect={vi.fn()}
        onRead={vi.fn()}
        rarityMode={false}
      />,
    )
    expect(html.includes('tabler-icon-star-filled')).toBe(starred)
    expect(html.includes('aria-label="starred"')).toBe(starred)
    if (starred) expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
  },
)
