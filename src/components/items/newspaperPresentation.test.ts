import { expect, it } from 'vitest'
import { newspaperExcerptLimit, newspaperRole } from './newspaperPresentation'

it('repeats uneven editorial roles without making later stories another lead', () => {
  expect(Array.from({ length: 9 }, (_, i) => newspaperRole(i))).toEqual([
    'lead',
    'brief',
    'image',
    'brief',
    'feature',
    'image',
    'brief',
    'standard',
    'feature',
  ])
  for (let i = 1; i < 100; i++) expect(newspaperRole(i + 8)).toBe(newspaperRole(i))
  expect(newspaperExcerptLimit('lead')).toBeGreaterThan(newspaperExcerptLimit('feature'))
  expect(newspaperExcerptLimit('feature')).toBeGreaterThan(newspaperExcerptLimit('brief'))
})
