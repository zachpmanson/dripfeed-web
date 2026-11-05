import type { NewsItem } from '../../api/types'

export const NEWSPAPER_CHUNK_SIZE = 50
export const NEWSPAPER_OVERSCAN = 1
// Even a very tall viewport or an inaccurate estimate cannot mount the pool.
export const NEWSPAPER_MAX_VISIBLE_CHUNKS = 3
export const NEWSPAPER_MAX_MOUNTED_CHUNKS = NEWSPAPER_MAX_VISIBLE_CHUNKS + NEWSPAPER_OVERSCAN * 2

export interface NewspaperChunk {
  start: number
  items: NewsItem[]
  signature: string
}

export function newspaperChunks(items: NewsItem[]): NewspaperChunk[] {
  const chunks: NewspaperChunk[] = []
  for (let start = 0; start < items.length; start += NEWSPAPER_CHUNK_SIZE) {
    const part = items.slice(start, start + NEWSPAPER_CHUNK_SIZE)
    chunks.push({ start, items: part, signature: part.map((item) => item.id).join(',') })
  }
  return chunks
}

export function estimatedChunkHeight(count: number, width: number, lead: boolean): number {
  const columns = Math.max(1, Math.min(3, Math.floor((width + 28) / (272 + 28))))
  return Math.ceil(count / columns) * 420 + (lead ? 300 : 0)
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
