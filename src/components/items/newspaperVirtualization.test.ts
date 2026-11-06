import { expect, it } from 'vitest'
import type { NewsItem } from '../../api/types'
import { newspaperOwnership, ownedNewspaperStacks } from './newspaperOwnership'
import {
  estimatedStoryHeight,
  newspaperColumnCount,
  newspaperColumnWidth,
  newspaperModel,
  newspaperRange,
  NEWSPAPER_MAX_MOUNTED,
} from './newspaperVirtualization'

it('uses the same 17rem/1.75rem geometry for one to three stacks and width-aware estimates', () => {
  for (const [width, columns] of [
    [0, 1],
    [271, 1],
    [571, 1],
    [572, 2],
    [871, 2],
    [872, 3],
    [2000, 3],
  ]) {
    expect(newspaperColumnCount(width)).toBe(columns)
  }
  expect(newspaperColumnWidth(900, 3)).toBe((900 - 56) / 3)
  expect(estimatedStoryHeight(272)).toBeGreaterThan(estimatedStoryHeight(500))
})

it('builds continuous, independently measured offsets across every former 50-story boundary', () => {
  const items = Array.from({ length: 155 }, (_, i) => ({ id: i + 1 }) as NewsItem)
  for (const count of [1, 2, 3]) {
    const ownership = newspaperOwnership(items, count)
    const stacks = ownedNewspaperStacks(items, ownership)
    const width = newspaperColumnWidth(900, count)
    const measurements = new Map(
      items.map((item) => [
        item.id,
        { width: item.id === 1 ? 900 : width, height: item.id % 3 === 0 ? 1200 : 180 },
      ]),
    )
    const model = newspaperModel(stacks, 900, measurements)
    expect(stacks.lead?.id).toBe(1)
    expect(
      stacks.columns
        .flat()
        .map((item) => item.id)
        .sort((a, b) => a - b),
    ).toEqual(items.slice(1).map((item) => item.id))
    model.columns.forEach(({ items, offsets }, column) => {
      items.forEach((item, index) => {
        expect(item.id).toBe(2 + column + index * count)
        expect(offsets[index + 1] - offsets[index]).toBe(measurements.get(item.id)!.height)
        const next = items[index + 1]
        if (next)
          expect(model.locations.get(next.id)!.top).toBe(
            model.locations.get(item.id)!.top + measurements.get(item.id)!.height,
          )
      })
    })
    expect(model.height).toBe(
      model.leadHeight + Math.max(...model.columns.map((column) => column.offsets.at(-1)!)),
    )
  }
})

it('bounds the combined column windows for 10,000 stories, rapid/deep jumps and enormous viewports', () => {
  const items = Array.from({ length: 10_000 }, (_, i) => ({ id: i + 1 }) as NewsItem)
  for (const count of [1, 2, 3]) {
    const model = newspaperModel(
      ownedNewspaperStacks(items, newspaperOwnership(items, count)),
      900,
      new Map(),
    )
    for (const id of [1, 9950, 5000, 2, 10000, 7000]) {
      const top = model.locations.get(id)!.top
      for (const height of [0, 600, 10_000_000]) {
        const ranges = model.columns.map(({ offsets }) =>
          newspaperRange(offsets, top - model.leadHeight, height, count),
        )
        expect(
          1 + ranges.reduce((sum, range) => sum + range.last - range.first + 1, 0),
        ).toBeLessThanOrEqual(NEWSPAPER_MAX_MOUNTED)
        const location = model.locations.get(id)!
        if (location.column >= 0) {
          expect(location.index).toBeGreaterThanOrEqual(ranges[location.column].first)
          expect(location.index).toBeLessThanOrEqual(ranges[location.column].last)
        }
      }
    }
  }
})

it('has zero-height empty columns and no phantom ownership-slot gaps after sparse clears', () => {
  const items = Array.from({ length: 155 }, (_, i) => ({ id: i + 1 }) as NewsItem)
  const ownership = newspaperOwnership(items, 3)
  const model = newspaperModel(
    ownedNewspaperStacks([items[49], items[100]], ownership),
    900,
    new Map(),
  )
  expect(model.leadHeight).toBe(0)
  expect(model.columns[1].offsets).toEqual([0])
  for (const column of model.columns) expect(column.offsets.length).toBe(column.items.length + 1)
  expect(model.locations.get(50)!.top).toBe(0)
  expect(model.locations.get(101)!.top).toBeGreaterThan(0)
})
