import type { NewsItem } from './api/types'

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
 */

export function rarityMultipliers(
  items: Iterable<NewsItem>,
  now = Date.now(),
): Map<number, number> {
  // Group pub_dates per feed, sorted ascending by date. Avoids allocating
  // full arrays per feed when we only need the sorted span.
  const dates = new Map<number, number[]>()
  for (const it of items) {
    if (!it.pubDate) continue
    let arr = dates.get(it.feedId)
    if (!arr) dates.set(it.feedId, (arr = []))
    arr.push(it.pubDate)
  }

  const mult = new Map<number, number>()
  for (const [feedId, arr] of dates) {
    if (arr.length < 2) continue // no inter-arrival sample → neutral 1.0
    arr.sort((a, b) => a - b)
    let sum = 0
    for (let i = 1; i < arr.length; i++) sum += (arr[i] - arr[i - 1]) / 3_600_000
    const avgGap = sum / (arr.length - 1)
    const raw = Math.pow(72 / Math.max(0.1, avgGap), 2.5)
    mult.set(feedId, Math.min(100, Math.max(0.0001, raw)))
  }
  void now
  return mult
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