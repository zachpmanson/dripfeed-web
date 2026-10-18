import { describe, expect, it } from 'vitest'
import { countFeedWindowItems } from './feedWindow'

describe('countFeedWindowItems', () => {
  it('does not count older starred items outside the newest-page boundary', () => {
    const items = [
      ...Array.from({ length: 25 }, (_, index) => ({ id: 100 - index, feedId: 7 })),
      ...Array.from({ length: 15 }, (_, index) => ({ id: 75 - index, feedId: 7 })),
      { id: 200, feedId: 8 },
    ]

    expect(countFeedWindowItems(items, 7, 76)).toBe(25)
  })

  it('counts all items when there is no stored page boundary', () => {
    expect(
      countFeedWindowItems(
        [
          { id: 100, feedId: 7 },
          { id: 10, feedId: 7 },
          { id: 9, feedId: 8 },
        ],
        7,
        undefined,
      ),
    ).toBe(2)
  })
})
