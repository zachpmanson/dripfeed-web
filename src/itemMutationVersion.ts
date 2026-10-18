import type { NewsItem } from './api/types'

/** Tracks local item writes so responses fetched earlier cannot undo them. */
export class ItemMutationVersion {
  private version = 0
  private readonly items = new Map<number, number>()

  snapshot(): number {
    return this.version
  }

  mark(itemId: number): void {
    this.version += 1
    this.items.set(itemId, this.version)
  }

  changedSince(itemId: number, snapshot: number): boolean {
    return (this.items.get(itemId) ?? 0) > snapshot
  }

  clear(): void {
    this.version = 0
    this.items.clear()
  }
}

/** Keep user-controlled flags when an older server response arrives late. */
export function mergeServerItem(
  server: NewsItem,
  local: NewsItem | undefined,
  preserveLocalState: boolean,
): NewsItem {
  return local && preserveLocalState
    ? { ...server, unread: local.unread, starred: local.starred }
    : server
}
