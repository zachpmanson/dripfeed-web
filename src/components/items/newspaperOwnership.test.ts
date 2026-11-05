import { expect, it } from 'vitest'
import type { NewsItem } from '../../api/types'
import {
  newspaperOwnership,
  ownedNewspaperChunks,
  ownedNewspaperColumns,
  ownedNewspaperItems,
  type NewspaperOwnership,
} from './newspaperOwnership'
import { newspaperRole } from './newspaperPresentation'

const items = Array.from({ length: 155 }, (_, index) => ({ id: index + 1 }) as NewsItem)
const placements = (current: NewsItem[], ownership: NewspaperOwnership) => {
  const result = new Map<number, { chunk: number; column: number; role: string }>()
  for (const chunk of ownedNewspaperChunks(ownedNewspaperItems(current, ownership), ownership)) {
    ownedNewspaperColumns(chunk, ownership.columns).forEach((column, index) => {
      column.forEach((local) => {
        result.set(chunk.items[local].id, {
          chunk: chunk.start,
          column: index,
          role: newspaperRole(chunk.slots[local]),
        })
      })
    })
    if (chunk.slots[0] === 0) result.set(chunk.items[0].id, { chunk: 0, column: -1, role: 'lead' })
  }
  return result
}

it('retains chunk, column and role across lead/boundary/bulk removals, read/star updates and fresh arrivals', () => {
  let ownership = newspaperOwnership(items, 3)
  const before = placements(items, ownership)
  // Remove the lead, both sides of chunk boundaries and all of a middle chunk.
  const remaining = items.filter(
    (item) => ![1, 2, 49, 50, 51, 100, 101].includes(item.id) && (item.id < 51 || item.id > 100),
  )
  const updated = remaining.map((item) => ({ ...item, unread: false, starred: true }))
  const fresh = { id: 999 } as NewsItem
  // Even a newer item arriving at the head cannot displace existing owners.
  const current = [fresh, ...updated].reverse()
  ownership = newspaperOwnership(current, 3, ownership)
  const after = placements(current, ownership)
  remaining.forEach((item) => expect(after.get(item.id)).toEqual(before.get(item.id)))
  expect(after.get(fresh.id)).toEqual({ chunk: 150, column: 2, role: newspaperRole(155) })
  expect([...after.values()].some((value) => value.role === 'lead')).toBe(false)
  const chunks = ownedNewspaperChunks(ownedNewspaperItems(current, ownership), ownership)
  expect(chunks.map((chunk) => chunk.start)).toEqual([0, 100, 150])
  // Rollback revives the same slot, not a newly appended card or promoted lead.
  ownership = newspaperOwnership([...current, items[0], items[49]], 3, ownership)
  const restored = placements([...current, items[0], items[49]], ownership)
  expect(restored.get(1)).toEqual(before.get(1))
  expect(restored.get(50)).toEqual(before.get(50))
})

it('rebalances only on column-count or explicit view reset, not width-only/data refresh', () => {
  const original = newspaperOwnership(items, 3)
  const remaining = items.filter((item) => item.id % 3 === 0).reverse()
  const stable = newspaperOwnership(remaining, 3, original)
  expect(placements(remaining, stable).get(150)).toEqual(placements(items, original).get(150))
  const responsive = newspaperOwnership(remaining, 2, stable)
  expect(placements(remaining, responsive).get(153)?.role).toBe('lead')
  expect(responsive.next).toBe(remaining.length)
  const view = newspaperOwnership([...remaining].reverse(), 2)
  expect(placements(remaining, view).get(3)?.role).toBe('lead')
  expect(view.slots.has(1)).toBe(false)
})
