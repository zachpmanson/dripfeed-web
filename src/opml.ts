import type { NewsFeed, NewsFolder } from './api/types'

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&apos;'
      default:
        return char
    }
  })
}

function feedOutline(feed: NewsFeed): string {
  const attrs = [
    `text="${escapeXml(feed.title)}"`,
    `title="${escapeXml(feed.title)}"`,
    'type="rss"',
    `xmlUrl="${escapeXml(feed.url)}"`,
  ]
  if (feed.link) attrs.push(`htmlUrl="${escapeXml(feed.link)}"`)
  return `<outline ${attrs.join(' ')} />`
}

export function serializeOpml(feeds: NewsFeed[], folders: NewsFolder[]): string {
  const remainingFolderIds = new Set(folders.map((folder) => folder.id))
  const ungrouped = feeds.filter(
    (feed) => feed.folderId === null || !remainingFolderIds.has(feed.folderId),
  )
  const outlines = [
    ...folders.map((folder) => {
      // Only the first outline for a repeated folder ID owns its feeds.
      const children = remainingFolderIds.delete(folder.id)
        ? feeds.filter((feed) => feed.folderId === folder.id).map(feedOutline)
        : []
      return `<outline text="${escapeXml(folder.name)}" title="${escapeXml(folder.name)}">${children.join('')}</outline>`
    }),
    ...ungrouped.map(feedOutline),
  ].join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>Dripfeed subscriptions</title><dateCreated>${new Date().toUTCString()}</dateCreated></head><body>${outlines}</body></opml>`
}

export function downloadOpml(feeds: NewsFeed[], folders: NewsFolder[]): void {
  const opmlXml = serializeOpml(feeds, folders)
  const url = URL.createObjectURL(new Blob([opmlXml], { type: 'text/x-opml; charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'dripfeed-feeds.opml'
  link.click()
  URL.revokeObjectURL(url)
}
