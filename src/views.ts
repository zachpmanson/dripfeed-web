export type View =
  | { kind: 'all' } // ALL items, ignores the only-unread/all toggle
  | { kind: 'allUnread' } // unread only, ignores the only-unread/all toggle
  | { kind: 'starred' }
  | { kind: 'folder'; id: number } // combined feed of a folder's feeds
  | { kind: 'feed'; id: number }

export type SortMode = 'newest' | 'rarity'

/** 'priority' floats unread items above read items without changing their order. */
export type ShowMode = 'all' | 'unread' | 'priority'
