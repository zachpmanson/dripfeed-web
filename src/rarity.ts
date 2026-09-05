import type { NewsItem } from './api/types'
import { FEED_WINDOW } from './api/sync'

/**
 * Weighted rarity sort — faithful port of dripfeed's
 * NewsReaderDetailFragment.kt ("weighted" strength) + the gap CTE in
 * DatabaseConnectionOrm.queryFeedGaps().
 *
 * Per feed: avg inter-article gap in hours (LAG over pub_date, ms → h).
 * multiplier  = clamp((72 / max(0.1, gap))^2.5, 0.0001, 100)
 * effective   = age_hours * multiplier, ascending
 * tie-break   = pub_date DESC
 *
 * Rare publishers (large gap) get a small multiplier and float up; chatty
 * ones sink. Feeds with < 2 dated items get the neutral multiplier 1.0.
 *
 * STABILITY: the gap sample is the newest FEED_WINDOW (20) items PER FEED by
 * publish date — the same window the initial sync fetches. Once a feed has
 * 20 items its gap/mult/rarity are locked; loading older history via
 * load-more never enters the top-20 set, so the score doesn't drift.
 */

export type RarityInfo = {
  gap: number // avg inter-article gap in hours
  mult: number // weighted multiplier (sort + effective age)
  rarity: number // gap/(gap+72), 0..1 — the displayed % is this ×100
}

/**
 * Per-feed avg inter-article gap in hours, computed from the NEWEST
 * FEED_WINDOW dated items per feed (by pubDate). Stable under growth: older
 * items can't displace the top N.
 */
export function feedGaps(items: Iterable<NewsItem>): Map<number, number> {
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
    const newest = arr.slice(-FEED_WINDOW) // most recent 20 by pubDate
    if (newest.length < 2) continue
    let sum = 0
    for (let i = 1; i < newest.length; i++) sum += (newest[i] - newest[i - 1]) / 3_600_000
    gaps.set(feedId, sum / (newest.length - 1))
  }
  return gaps
}

export function rarityMultipliers(
  items: Iterable<NewsItem>,
  _now = Date.now(),
): Map<number, number> {
  const mult = new Map<number, number>()
  for (const [feedId, avgGap] of feedGaps(items)) {
    const raw = Math.pow(72 / Math.max(0.1, avgGap), 2.5)
    mult.set(feedId, Math.min(100, Math.max(0.0001, raw)))
  }
  return mult
}

/** Per-feed stats for the list display: gap, mult, rarity%. */
export function rarityStats(items: Iterable<NewsItem>): Map<number, RarityInfo> {
  const out = new Map<number, RarityInfo>()
  for (const [feedId, gap] of feedGaps(items)) {
    const rarity = gap / (gap + 72)
    const raw = Math.pow(72 / Math.max(0.1, gap), 2.5)
    out.set(feedId, {
      gap,
      rarity,
      mult: Math.min(100, Math.max(0.0001, raw)),
    })
  }
  return out
}

export function sortByRarity(
  items: NewsItem[],
  multipliers?: Map<number, number>,
  now = Date.now(),
): NewsItem[] {
  const mult = multipliers ?? rarityMultipliers(items)
  return [...items].sort((a, b) => {
    const sa = score(a, mult, now)
    const sb = score(b, mult, now)
    if (sa !== sb) return sa - sb
    return (b.pubDate ?? 0) - (a.pubDate ?? 0)
  })
}

function score(it: NewsItem, mult: Map<number, number>, now: number): number {
  if (!it.pubDate) return Number.MAX_SAFE_INTEGER // undated items sink
  const m = mult.get(it.feedId) ?? 1
  return Math.max(0, (now - it.pubDate) / 3_600_000) * m
}