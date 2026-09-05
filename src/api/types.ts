// JSON shapes as serialized by nextcloud/news (lib/Db/Item.php jsonSerialize,
// ItemApiController v1-3). Verified against current master (28.7.x).
export interface NewsItem {
  id: number
  guid: string
  guidHash: string
  url: string
  title: string
  author: string | null
  pubDate: number | null // ms epoch
  updatedDate: number | null
  body: string // HTML
  enclosureMime: string | null
  enclosureLink: string | null
  mediaThumbnail: string | null
  mediaDescription: string | null
  feedId: number
  unread: boolean
  starred: boolean
  filtered: boolean
  lastModified: number // ms epoch
  rtl: boolean
  intro: string | null
  fingerprint: string | null
  categories: unknown[]
  sharedBy: string | null
  sharedByDisplayName: string | null
}

export interface NewsFeed {
  id: number
  url: string
  title: string
  faviconLink: string | null
  added: number
  folderId: number | null
  unreadCount: number
  ordering: number
  link: string | null
  pinned: boolean
  updateErrorCount: number
  lastUpdateError: string | null
}

export interface ItemsResponse {
  items: NewsItem[]
  newestItemId?: number // present on /items/updated replies
}

export interface NewsFolder {
  id: number
  parentId: number | null
  name: string
  opened: boolean
}

export interface FeedsResponse {
  feeds: NewsFeed[]
}

export interface FoldersResponse {
  folders: NewsFolder[]
}

export type ListType = 0 | 1 | 2 | 3 // FEED | FOLDER | STARRED | ALL_ITEMS

export const LIST_TYPES = { FEED: 0, FOLDER: 1, STARRED: 2, ALL: 3 } as const