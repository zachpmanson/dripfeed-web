// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { NewsFeed, NewsFolder } from './api/types'
import { serializeOpml } from './opml'

function feed(id: number, folderId: number | null): NewsFeed {
  return {
    id,
    folderId,
    title: `Feed ${id} & <news> "quoted" 'title'`,
    url: `https://example.com/feed/${id}?a=1&b=<two>&quote="&apostrophe='`,
    link: `https://example.com/${id}?a=1&b=<two>&quote="&apostrophe='`,
    faviconLink: null,
    added: 0,
    unreadCount: 0,
    ordering: 0,
    pinned: false,
    fullTextEnabled: false,
    updateErrorCount: 0,
    lastUpdateError: null,
  }
}

function folder(id: number, name = `Folder ${id}`): NewsFolder {
  return { id, name, parentId: null, opened: true }
}

function parseExport(feeds: NewsFeed[], folders: NewsFolder[]): Document {
  const xml = new DOMParser().parseFromString(serializeOpml(feeds, folders), 'application/xml')
  expect(xml.querySelector('parsererror')).toBeNull()
  expect(xml.documentElement.tagName).toBe('opml')
  expect(xml.documentElement.getAttribute('version')).toBe('2.0')
  // Compare the complete decoded URLs, including duplicate occurrences and XML metacharacters.
  expect(
    Array.from(xml.querySelectorAll('outline[xmlUrl]'), (outline) =>
      outline.getAttribute('xmlUrl'),
    ).sort(),
  ).toEqual(feeds.map((feed) => feed.url).sort())
  return xml
}

function rootUrls(xml: Document): (string | null)[] {
  return Array.from(xml.querySelectorAll('body > outline[xmlUrl]'), (outline) =>
    outline.getAttribute('xmlUrl'),
  )
}

describe('OPML export', () => {
  it('exports null, zero and orphan folder references at root while retaining normal grouping', () => {
    const feeds = [feed(1, null), feed(2, 0), feed(3, 999), feed(4, 7)]
    const xml = parseExport(feeds, [folder(7)])

    expect(rootUrls(xml)).toEqual(feeds.slice(0, 3).map((feed) => feed.url))
    expect(xml.querySelector('body > outline > outline')?.getAttribute('xmlUrl')).toBe(feeds[3].url)
  })

  it('exports every feed at root when no folders are supplied', () => {
    const feeds = [feed(1, null), feed(2, 0), feed(3, 7)]
    expect(rootUrls(parseExport(feeds, []))).toEqual(feeds.map((feed) => feed.url))
  })

  it('honors a supplied folder with ID zero without duplicating its feeds', () => {
    const feeds = [feed(1, 0), feed(2, null)]
    const xml = parseExport(feeds, [folder(0), folder(0, 'Duplicate')])

    expect(xml.querySelector('body > outline > outline')?.getAttribute('xmlUrl')).toBe(feeds[0].url)
    expect(rootUrls(xml)).toEqual([feeds[1].url])
  })

  it('does not duplicate feeds when folder IDs repeat', () => {
    const feeds = [feed(1, 7), feed(2, 7), feed(3, 8), feed(4, null)]
    const xml = parseExport(feeds, [folder(7), folder(7, 'Duplicate'), folder(8)])
    const groups = xml.querySelectorAll('body > outline:not([xmlUrl])')

    expect(Array.from(groups, (group) => group.querySelectorAll('[xmlUrl]').length)).toEqual([
      2, 0, 1,
    ])
    expect(rootUrls(xml)).toEqual([feeds[3].url])
  })

  it('preserves normal ordering, empty folders and escaped attributes', () => {
    const name = `Folder & <news> "quoted" 'name'`
    const feeds = [feed(1, 7), { ...feed(2, null), link: null }]
    const xml = parseExport(feeds, [folder(7, name), folder(8)])
    const groups = xml.querySelectorAll('body > outline:not([xmlUrl])')
    const outlines = xml.querySelectorAll('outline[xmlUrl]')

    expect(
      Array.from(xml.querySelector('body')!.children, (outline) => outline.getAttribute('text')),
    ).toEqual([name, 'Folder 8', feeds[1].title])
    expect(groups[0].getAttribute('title')).toBe(name)
    expect(groups[1].children).toHaveLength(0)
    outlines.forEach((outline, index) => {
      expect(outline.getAttribute('text')).toBe(feeds[index].title)
      expect(outline.getAttribute('title')).toBe(feeds[index].title)
      expect(outline.getAttribute('type')).toBe('rss')
      expect(outline.getAttribute('htmlUrl')).toBe(feeds[index].link)
    })
  })

  it('preserves repeated input feed entries rather than deduplicating by ID or URL', () => {
    const grouped = feed(1, 7)
    const ungrouped = feed(2, 999)
    parseExport([grouped, grouped, ungrouped, ungrouped], [folder(7), folder(7)])
  })

  it('produces a valid empty OPML document for empty input', () => {
    expect(parseExport([], []).querySelector('body')?.children).toHaveLength(0)
  })
})
