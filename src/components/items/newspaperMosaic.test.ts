import { expect, it } from 'vitest'
import {
  mosaicRowSpan,
  newspaperColumns,
  newspaperExcerptLimit,
  newspaperRole,
} from './newspaperMosaic'

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
  expect(Array.from({ length: 9 }, (_, i) => newspaperColumns(newspaperRole(i)))).toEqual([
    2, 1, 1, 1, 2, 1, 1, 1, 2,
  ])
  for (let i = 1; i < 100; i++) expect(newspaperRole(i + 8)).toBe(newspaperRole(i))
  expect(newspaperExcerptLimit('lead')).toBeGreaterThan(newspaperExcerptLimit('feature'))
  expect(newspaperExcerptLimit('feature')).toBeGreaterThan(newspaperExcerptLimit('brief'))
})

it('rounds natural footprints up to fine rows, never clipping fractional content', () => {
  expect([0, 1, 4, 4.1, 167, 400, 721.5].map(mosaicRowSpan)).toEqual([1, 1, 1, 2, 42, 100, 181])
})
