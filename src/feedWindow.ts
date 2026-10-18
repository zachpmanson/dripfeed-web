export interface FeedWindowItem {
  id: number
  feedId: number
}

/**
 * Count items in the current feed window, excluding older starred items
 * which are stored separately from the newest per-feed page.
 */
export function countFeedWindowItems(
  items: FeedWindowItem[],
  feedId: number,
  boundary: number | undefined,
): number {
  return items.reduce(
    (count, item) =>
      count + (item.feedId === feedId && (boundary === undefined || item.id >= boundary) ? 1 : 0),
    0,
  )
}
