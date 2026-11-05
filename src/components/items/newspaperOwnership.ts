import type { NewsItem } from '../../api/types'
import { NEWSPAPER_CHUNK_SIZE, type NewspaperChunk } from './newspaperVirtualization'

export type NewspaperOwnership = {
  columns: number
  slots: Map<number, number>
  next: number
}

/** A slot owns chunk, column and presentation, even while its story is filtered
 * out. Keep tombstones until the view resets so a failed read can return home. */
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

export function ownedNewspaperChunks(
  items: NewsItem[],
  ownership: NewspaperOwnership,
): NewspaperChunk[] {
  const chunks: NewspaperChunk[] = []
  for (const item of items) {
    const slot = ownership.slots.get(item.id)!
    const start = Math.floor(slot / NEWSPAPER_CHUNK_SIZE) * NEWSPAPER_CHUNK_SIZE
    let chunk = chunks.at(-1)
    if (chunk?.start !== start) {
      chunk = { start, items: [], slots: [], signature: '' }
      chunks.push(chunk)
    }
    chunk!.items.push(item)
    chunk!.slots.push(slot)
  }
  for (const chunk of chunks) {
    chunk.signature = chunk.slots.map((slot, index) => `${slot}:${chunk.items[index].id}`).join(',')
  }
  return chunks
}

export function ownedNewspaperColumns(chunk: NewspaperChunk, columns: number): number[][] {
  const stacks = Array.from({ length: columns }, () => [] as number[])
  chunk.slots.forEach((slot, index) => {
    if (slot === 0) return
    const local = slot - chunk.start - (chunk.start === 0 ? 1 : 0)
    stacks[local % columns].push(index)
  })
  return stacks
}
