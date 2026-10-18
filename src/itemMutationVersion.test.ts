import { describe, expect, it } from 'vitest'
import type { NewsItem } from './api/types'
import { ItemMutationVersion, mergeServerItem } from './itemMutationVersion'

const item = (unread: boolean, starred: boolean, title = 'server'): NewsItem => ({
  id: 1,
  guid: 'guid',
  guidHash: 'hash',
  url: 'https://example.com',
  title,
  author: null,
  pubDate: null,
  updatedDate: null,
  body: '',
  enclosureMime: null,
  enclosureLink: null,
  mediaThumbnail: null,
  mediaDescription: null,
  feedId: 1,
  unread,
  starred,
  filtered: false,
  lastModified: 0,
  rtl: false,
  intro: null,
  fingerprint: null,
  categories: [],
  sharedBy: null,
  sharedByDisplayName: null,
})

describe('item mutation versioning', () => {
  it('preserves a local read/star change against a stale server response', () => {
    const versions = new ItemMutationVersion()
    const requestVersion = versions.snapshot()
    const locallyUpdated = item(false, true, 'optimistic title')
    versions.mark(locallyUpdated.id)

    expect(versions.changedSince(locallyUpdated.id, requestVersion)).toBe(true)
    expect(mergeServerItem(item(true, false), locallyUpdated, true)).toMatchObject({
      title: 'server',
      unread: false,
      starred: true,
    })
  })

  it('accepts server state when no newer local mutation occurred', () => {
    const versions = new ItemMutationVersion()
    const requestVersion = versions.snapshot()
    const serverItem = item(true, false)

    expect(versions.changedSince(serverItem.id, requestVersion)).toBe(false)
    expect(mergeServerItem(serverItem, undefined, false)).toBe(serverItem)
  })
})
