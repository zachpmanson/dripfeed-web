import type { NewsItem } from '../../api/types'

export const NEWSPAPER_CHUNK_SIZE = 50
export const NEWSPAPER_OVERSCAN = 1
// Even a very tall viewport or an inaccurate estimate cannot mount the pool.
export const NEWSPAPER_MAX_VISIBLE_CHUNKS = 3
export const NEWSPAPER_MAX_MOUNTED_CHUNKS = NEWSPAPER_MAX_VISIBLE_CHUNKS + NEWSPAPER_OVERSCAN * 2

export interface NewspaperChunk {
  start: number
  items: NewsItem[]
  slots: number[]
  signature: string
}

// Match the 17rem minimum column width and 1.75rem gap at the app's 16px root.
export function newspaperColumnCount(width: number): number {
  return Math.max(1, Math.min(3, Math.floor((width + 28) / (272 + 28))))
}

/** Local indices retain absolute rank/roles even though DOM traversal is down columns. */
export function newspaperColumnIndices(count: number, columns: number, lead: boolean): number[][] {
  const stacks = Array.from({ length: columns }, () => [] as number[])
  const start = lead && count > 0 ? 1 : 0
  for (let index = start; index < count; index++) stacks[(index - start) % columns].push(index)
  return stacks
}

export function estimatedChunkHeight(
  count: number,
  width: number,
  lead: boolean,
  tallestColumn = Math.ceil(count / newspaperColumnCount(width)),
): number {
  return tallestColumn * 420 + (lead ? 300 : 0)
}

export function chunkAt(offsets: number[], top: number): number {
  let index = 0
  while (index + 1 < offsets.length - 1 && offsets[index + 1] <= top) index++
  return index
}

export function newspaperRange(
  offsets: number[],
  top: number,
  height: number,
  target: number | null,
) {
  const last = Math.max(0, offsets.length - 2)
  const firstVisible = Math.min(last, target ?? chunkAt(offsets, top))
  const lastVisible = Math.min(
    last,
    firstVisible + NEWSPAPER_MAX_VISIBLE_CHUNKS - 1,
    target === null ? chunkAt(offsets, top + height) : firstVisible,
  )
  return {
    first: Math.max(0, firstVisible - NEWSPAPER_OVERSCAN),
    last: Math.min(last, lastVisible + NEWSPAPER_OVERSCAN),
  }
}
