export type NewspaperRole = 'lead' | 'feature' | 'brief' | 'image' | 'standard'

const PATTERN: readonly NewspaperRole[] = [
  'feature',
  'brief',
  'image',
  'brief',
  'feature',
  'image',
  'brief',
  'standard',
]

/** Assign presentation only: never sort, filter, or backfill the caller's sequence. */
export function newspaperRole(index: number): NewspaperRole {
  return index === 0 ? 'lead' : PATTERN[index % PATTERN.length]
}

export function newspaperColumns(role: NewspaperRole): number {
  return role === 'lead' || role === 'feature' ? 2 : 1
}

export function newspaperExcerptLimit(role: NewspaperRole): number {
  return { lead: 480, feature: 400, brief: 160, image: 200, standard: 280 }[role]
}

// Keep in sync with .newspaper's grid-auto-rows. There is no CSS row gap:
// each measured footprint includes its own padding, border and bottom margin.
export const MOSAIC_ROW_HEIGHT = 4

export function mosaicRowSpan(height: number): number {
  return Math.max(1, Math.ceil(height / MOSAIC_ROW_HEIGHT))
}
