import type { NewsItem } from '../../api/types'
import type { NewspaperStacks } from './newspaperOwnership'

export const NEWSPAPER_EXPOSURE_STEP = 50
export const NEWSPAPER_MAX_MOUNTED = 250
export const NEWSPAPER_OVERSCAN = 1200
export type NewspaperMeasurement = { width: number; height: number }
export type NewspaperColumn = { items: NewsItem[]; offsets: number[]; top: number }
export type NewspaperModel = {
  lead: NewsItem | null
  leadHeight: number
  columns: NewspaperColumn[]
  locations: Map<number, { column: number; index: number; top: number }>
  height: number
}

// Match the 17rem minimum column width and 1.75rem gap at the app's 16px root.
export function newspaperColumnCount(width: number): number {
  return Math.max(1, Math.min(3, Math.floor((width + 28) / (272 + 28))))
}

export function newspaperColumnWidth(width: number, columns: number): number {
  return (width - (columns - 1) * 28) / columns
}

export function estimatedStoryHeight(width: number, lead = false): number {
  return lead ? 300 : Math.max(220, Math.min(750, 420 * Math.sqrt(300 / Math.max(1, width))))
}

/** Offsets include the story's trailing margin. No maximum across columns is
 * used until the final tail, so there is no cross-column pagination barrier. */
export function newspaperModel(
  stacks: NewspaperStacks,
  width: number,
  measurements: Map<number, NewspaperMeasurement>,
): NewspaperModel {
  const extent = (item: NewsItem, width: number, lead = false) => {
    const saved = measurements.get(item.id)
    return saved && Math.abs(saved.width - width) < 1
      ? saved.height
      : estimatedStoryHeight(width, lead)
  }
  const columnWidth = newspaperColumnWidth(width, stacks.columns.length)
  const leadWidth =
    columnWidth * Math.min(2, stacks.columns.length) + (stacks.columns.length > 1 ? 28 : 0)
  const leadHeight = stacks.lead ? extent(stacks.lead, leadWidth, true) : 0
  const locations: NewspaperModel['locations'] = new Map()
  if (stacks.lead) locations.set(stacks.lead.id, { column: -1, index: 0, top: 0 })
  const columns = stacks.columns.map((items, column) => {
    const top = column < 2 ? leadHeight : 0
    const offsets = [0]
    items.forEach((item, index) => {
      locations.set(item.id, { column, index, top: top + offsets[index] })
      offsets.push(offsets[index] + extent(item, columnWidth))
    })
    return { items, offsets, top }
  })
  return {
    lead: stacks.lead,
    leadHeight,
    columns,
    locations,
    height: Math.max(leadHeight, ...columns.map(({ top, offsets }) => top + offsets.at(-1)!)),
  }
}

export function storyAt(offsets: number[], top: number): number {
  let low = 0
  let high = Math.max(0, offsets.length - 2)
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (offsets[middle] <= top) low = middle
    else high = middle - 1
  }
  return low
}

/** The shared scroll position windows each stack independently. Reserve one
 * global lead slot, not another 250-story budget for every column. */
export function newspaperRange(offsets: number[], top: number, height: number, columns: number) {
  const limit = Math.floor((NEWSPAPER_MAX_MOUNTED - 1) / columns)
  const visible = storyAt(offsets, top)
  const first = Math.max(
    0,
    storyAt(offsets, top - NEWSPAPER_OVERSCAN),
    visible - Math.floor(limit / 4),
  )
  return {
    first,
    last: Math.min(
      offsets.length - 2,
      storyAt(offsets, top + height + NEWSPAPER_OVERSCAN),
      first + limit - 1,
    ),
  }
}
