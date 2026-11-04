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

export function newspaperExcerptLimit(role: NewspaperRole): number {
  return { lead: 480, feature: 400, brief: 160, image: 200, standard: 280 }[role]
}
