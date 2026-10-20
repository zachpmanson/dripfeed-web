import { describe, expect, it, vi } from 'vitest'
import type { NewsItem } from './api/types'
import { FEED_WINDOW } from './api/sync'
import { feedGaps, rarityMultipliers, rarityStats, sortByRarity } from './rarity'

function item(id: number, feedId: number, pubDate: number | null): NewsItem {
  return {
    id,
    feedId,
    pubDate,
    guid: String(id),
    guidHash: String(id),
    url: '',
    title: '',
    author: null,
    updatedDate: null,
    body: '',
    enclosureMime: null,
    enclosureLink: null,
    mediaThumbnail: null,
    mediaDescription: null,
    unread: true,
    starred: false,
    filtered: false,
    lastModified: 0,
    rtl: false,
    intro: null,
    fingerprint: null,
    categories: [],
    sharedBy: null,
    sharedByDisplayName: null,
  }
}

// Pre-correction implementation: deliberately collect/sort the entire history
// and preserve its arithmetic order, rather than using a telescoping average.
function referenceFeedGaps(items: Iterable<NewsItem>): Map<number, number> {
  const dates = new Map<number, number[]>()
  for (const it of items) {
    if (!it.pubDate) continue
    let arr = dates.get(it.feedId)
    if (!arr) dates.set(it.feedId, (arr = []))
    arr.push(it.pubDate)
  }
  const gaps = new Map<number, number>()
  for (const [feedId, arr] of dates) {
    if (arr.length < 2) continue
    arr.sort((a, b) => a - b)
    const newest = arr.slice(-FEED_WINDOW)
    if (newest.length < 2) continue
    let sum = 0
    for (let i = 1; i < newest.length; i++) sum += (newest[i] - newest[i - 1]) / 3_600_000
    gaps.set(feedId, sum / (newest.length - 1))
  }
  return gaps
}

function expectEquivalent(items: NewsItem[]) {
  const gaps = referenceFeedGaps(items)
  // Entry arrays also check feed iteration order, not just map membership.
  expect([...feedGaps(items)]).toEqual([...gaps])
  const multipliers = new Map(
    [...gaps].map(([feedId, gap]) => [
      feedId,
      Math.min(100, Math.max(0.0001, Math.pow(72 / Math.max(0.1, gap), 2.5))),
    ]),
  )
  expect([...rarityMultipliers(items)]).toEqual([...multipliers])
  expect([...rarityStats(items)]).toEqual(
    [...gaps].map(([feedId, gap]) => [
      feedId,
      { gap, mult: multipliers.get(feedId), rarity: gap / (gap + 72) },
    ]),
  )
  const now = 1_800_000_000_000
  const score = (it: NewsItem) =>
    !it.pubDate
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, (now - it.pubDate) / 3_600_000) * (multipliers.get(it.feedId) ?? 1)
  const sorted = [...items].sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    if (sa !== sb) return sa - sb
    return (b.pubDate ?? 0) - (a.pubDate ?? 0)
  })
  expect(sortByRarity(items, undefined, now)).toEqual(sorted)
  expect(sortByRarity(items, multipliers, now)).toEqual(sorted)
}

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function shuffled<T>(values: T[], next: () => number): T[] {
  const out = [...values]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

describe('bounded feed gap samples', () => {
  it('preserves filtering, duplicates, and neutral feeds with fewer than two dated entries', () => {
    const items = [
      item(1, 1, null),
      item(2, 1, 0),
      item(3, 1, NaN),
      item(4, 2, 3_600_000),
      item(5, 2, null),
      item(6, 3, -3_600_000),
      item(7, 3, 3_600_000),
      ...Array.from({ length: 25 }, (_, i) => item(8 + i, 4, 7_200_000)),
    ]
    expect([...feedGaps(items)]).toEqual([
      [3, 2],
      [4, 0],
    ])
    expectEquivalent([])
    expectEquivalent(items)
  })

  it('matches the old reference exactly across deterministic shuffled mixed-feed histories', () => {
    for (let seed = 1; seed <= 32; seed++) {
      const next = random(seed)
      const items = Array.from({ length: 1_600 }, (_, id) => {
        const feedId = 1 + Math.floor(next() * 12)
        const kind = Math.floor(next() * 10)
        const date =
          kind === 0
            ? null
            : kind === 1
              ? 0
              : kind === 2
                ? NaN
                : kind < 6
                  ? 1_700_000_000_000 + (id % 3) * 3_600_000
                  : (next() - 0.1) * 2_000_000_000_000
        return item(id, feedId, date)
      })
      // Sparse feeds stay neutral even among much deeper neighboring feeds.
      items.push(item(1_600, 13, null), item(1_601, 14, 1_700_000_000_000))
      expectEquivalent(items)
      expectEquivalent(shuffled(items, next))
      expectEquivalent([...items].reverse())
    }
  })

  it('retains duplicate dates at the window boundary and sums gaps in the original order', () => {
    const dates = [
      -10,
      1,
      1,
      1,
      ...Array.from({ length: FEED_WINDOW - 3 }, (_, i) => 2 + i / 7),
      1_700_000_000_000.125,
    ]
    const items = dates.map((date, id) => item(id, 1, date))
    expectEquivalent(items)
    expectEquivalent([...items].reverse())
    expectEquivalent(shuffled(items, random(91)))

    const fractional = Array.from({ length: FEED_WINDOW }, (_, id) =>
      item(id, 1, 1_700_000_000_000 + id * 123_456.789),
    )
    expectEquivalent(fractional)
    const telescoped =
      (fractional.at(-1)!.pubDate! - fractional[0].pubDate!) / 3_600_000 / (FEED_WINDOW - 1)
    expect(feedGaps(fractional).get(1)).not.toBe(telescoped)
  })

  it('does not change gaps or retained ranking when deep older history is appended', () => {
    const newest = Array.from({ length: FEED_WINDOW * 3 }, (_, id) =>
      item(id, (id % 3) + 1, 1_700_000_000_000 + Math.floor(id / 3) * 3_600_000),
    )
    const older = Array.from({ length: 20_000 }, (_, id) =>
      item(id + newest.length, (id % 3) + 1, 1_600_000_000_000 - id * 123_456.789),
    )
    const all = [...newest, ...older]
    expect([...feedGaps(all)]).toEqual([...feedGaps(newest)])
    const now = 1_800_000_000_000
    expect(sortByRarity(newest, rarityMultipliers(all), now)).toEqual(
      sortByRarity(newest, undefined, now),
    )
    expectEquivalent(all)
  })

  it('observes at most FEED_WINDOW retained dates per feed after every input item', () => {
    const items = shuffled(
      Array.from({ length: 6_000 }, (_, id) => item(id, (id % 3) + 1, id + 1)),
      random(20),
    )
    // Observe the actual private sample arrays through Map.set; no exported
    // implementation hooks or elapsed-time assumptions are needed.
    const set = vi.spyOn(Map.prototype, 'set')
    let observations = 0
    let peakPerFeed = 0
    let peakTotal = 0
    function* observedItems() {
      for (const it of items) {
        yield it
        let total = 0
        for (const [, value] of set.mock.calls) {
          if (!Array.isArray(value)) continue
          peakPerFeed = Math.max(peakPerFeed, value.length)
          total += value.length
          if (value.length > FEED_WINDOW) throw new Error('Retained sample exceeded FEED_WINDOW')
        }
        peakTotal = Math.max(peakTotal, total)
        observations++
      }
    }
    let samples: [number, number[]][]
    try {
      feedGaps(observedItems())
      samples = set.mock.calls.filter(([, value]) => Array.isArray(value))
    } finally {
      set.mockRestore()
    }
    expect(observations).toBe(items.length)
    expect(peakPerFeed).toBe(FEED_WINDOW)
    expect(peakTotal).toBe(3 * FEED_WINDOW)
    expect(samples).toHaveLength(3)
    for (const [feedId, dates] of samples) {
      expect(dates).toEqual(
        items
          .filter((it) => it.feedId === feedId)
          .map((it) => it.pubDate)
          .sort((a, b) => a! - b!)
          .slice(-FEED_WINDOW),
      )
    }
  })
})
