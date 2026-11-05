import { expect, it } from 'vitest'
import {
  estimatedChunkHeight,
  newspaperColumnCount,
  newspaperColumnIndices,
} from './newspaperVirtualization'

it('uses the same 17rem/1.75rem geometry for one to three stacks and estimates', () => {
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
    expect(estimatedChunkHeight(50, width, false)).toBe(Math.ceil(50 / columns) * 420)
  }
})

it('deals local ranks round-robin, excluding only the global spanning lead', () => {
  expect(newspaperColumnIndices(10, 3, true)).toEqual([
    [1, 4, 7],
    [2, 5, 8],
    [3, 6, 9],
  ])
  expect(newspaperColumnIndices(9, 3, false)).toEqual([
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
  ])
  expect(newspaperColumnIndices(4, 1, true)).toEqual([[1, 2, 3]])
  expect(newspaperColumnIndices(1, 3, true)).toEqual([[], [], []])
  expect(newspaperColumnIndices(0, 2, false)).toEqual([[], []])
})

it('preserves every rank exactly once in balanced increasing stacks for full and partial chunks', () => {
  for (const count of [1, 2, 17, 49, 50]) {
    for (const columns of [1, 2, 3]) {
      for (const lead of [false, true]) {
        const stacks = newspaperColumnIndices(count, columns, lead)
        const start = lead ? 1 : 0
        expect(stacks.flat().sort((a, b) => a - b)).toEqual(
          Array.from({ length: count - start }, (_, i) => i + start),
        )
        const lengths = stacks.map((stack) => stack.length)
        expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1)
        stacks.forEach((stack, column) => {
          expect(stack).toEqual(
            Array.from({ length: stack.length }, (_, row) => start + column + row * columns),
          )
        })
      }
    }
  }
})
