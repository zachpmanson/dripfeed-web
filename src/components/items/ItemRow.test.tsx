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

it('renders read and star state without an unread dot', () => {
  const render = (unread: boolean, starred: boolean) =>
    renderToStaticMarkup(
      <ItemRow
        item={{ ...item, unread, starred }}
        selected={false}
        feedTitle={() => 'Example feed'}
        showFavicons={false}
        singleClickRead={false}
        onSelect={vi.fn()}
        onRead={vi.fn()}
        rarityMode={false}
      />,
    )
  const unread = render(true, false)
  const read = render(false, true)
  const unreadStarred = render(true, true)
  const titleClasses = (html: string) =>
    html.match(/<div class="item-title([^"]*)">Article title<\/div>/)?.[1]
  expect(titleClasses(unread)).toBeDefined()
  expect(titleClasses(unread)).not.toContain('text-app-muted')
  expect(titleClasses(read)).toContain('text-app-muted')
  expect(titleClasses(unreadStarred)).toBe(titleClasses(unread))
  expect(unreadStarred).toContain('aria-label="starred"')
  expect(unread).not.toContain('unread-dot')
  expect(read).not.toContain('unread-dot')
  expect(unread).not.toContain('tabler-icon-star-filled')
  expect(unread).not.toContain('aria-label="starred"')
  expect(read).toMatch(/<span aria-label="starred"><svg[^>]*aria-hidden="true"[^>]*>/)
  expect(read).toContain('tabler-icon-star-filled')
})
