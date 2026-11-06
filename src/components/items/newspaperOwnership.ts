import type { NewsItem } from '../../api/types'

export type NewspaperOwnership = {
  columns: number
  slots: Map<number, number>
  next: number
}

/** A slot owns column and presentation, even while its story is filtered out.
 * Keep tombstones until the view resets so a failed read can return home. */
export function newspaperOwnership(
  items: NewsItem[],
  columns: number,
  previous?: NewspaperOwnership,
): NewspaperOwnership {
  const slots = new Map(previous?.columns === columns ? previous.slots : [])
  let next = previous?.columns === columns ? previous.next : 0
  for (const item of items) {
    if (!slots.has(item.id)) slots.set(item.id, next++)
  }
  return { columns, slots, next }
}

export function ownedNewspaperItems(items: NewsItem[], ownership: NewspaperOwnership): NewsItem[] {
  return [...items].sort((a, b) => ownership.slots.get(a.id)! - ownership.slots.get(b.id)!)
}

export type NewspaperStacks = { lead: NewsItem | null; columns: NewsItem[][] }

/** One continuous deal: exposure/page boundaries never restart a column. */
export function ownedNewspaperStacks(
  items: NewsItem[],
  ownership: NewspaperOwnership,
): NewspaperStacks {
  const columns = Array.from({ length: ownership.columns }, () => [] as NewsItem[])
  let lead: NewsItem | null = null
  for (const item of items) {
    const slot = ownership.slots.get(item.id)!
    if (slot === 0) lead = item
    else columns[(slot - 1) % ownership.columns].push(item)
  }
  return { lead, columns }
}
