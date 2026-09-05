import { useState, useEffect, useCallback } from 'react'
import {
  fullSync, incrementalSync, isInitialized, isDbReady, loadAllItems,
  loadFeeds, loadFolders, onStoreChange, getStatus, resetLocal,
} from './store'
import { dbQueryItems } from './db'
import { setRead, setStar } from './actions'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'
import type { Settings } from './settings'
import { PAGE_SIZE } from './api/sync'

export interface AppData {
  ready: boolean
  items: NewsItem[] // loaded window
  feeds: Map<number, NewsFeed>
  folders: NewsFolder[]
  allLoaded: boolean
  count: number
}

/**
 * Owns the whole data lifecycle: hydrates IndexedDB on first run (full
 * sync, progress surfaced via bundle), then keeps it fresh with a poll.
 * The UI reads a rendered window; "load more" widens it locally.
 */
export function useStore(settings: Settings | null) {
  const [ready, setReady] = useState(false)
  const [items, setItems] = useState<NewsItem[]>([])
  const [feeds, setFeeds] = useState<Map<number, NewsFeed>>(new Map())
  const [folders, setFolders] = useState<NewsFolder[]>([])
  const [count, setCount] = useState(0)
  const [allLoaded, setAllLoaded] = useState(false)
  const [progress, setProgress] = useState<{ done: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshWindow = useCallback(async () => {
    const [win, all, fs, fo] = await Promise.all([
      dbQueryItems(PAGE_SIZE, 0),
      loadAllItems(),
      loadFeeds(),
      loadFolders(),
    ])
    setItems(win)
    setFeeds(new Map(fs.map((f) => [f.id, f])))
    setFolders(fo)
    setCount(all.length)
    setAllLoaded(all.length <= PAGE_SIZE)
  }, [])

  useEffect(() => {
    if (!settings) return
    let cancelled = false

    const off = onStoreChange(() => {
      if (cancelled) return
      void refreshWindow()
    })

    ;(async () => {
      if (await isInitialized()) {
        await refreshWindow()
        setReady(true)
        try {
          await incrementalSync(settings)
          void refreshWindow()
        } catch (e) {
          // background refresh failure is non-fatal
          console.warn('incremental sync failed', e)
        }
      } else {
        try {
          await fullSync(settings)
          if (cancelled) return
          await refreshWindow()
          setReady(true)
        } catch (e) {
          if (!cancelled) setError(String(e))
        }
      }
    })()

    const poll = setInterval(() => {
      if (isDbReady()) {
        incrementalSync(settings).catch((e) => console.warn('poll sync failed', e))
      }
    }, 3 * 60_000)

    return () => {
      cancelled = true
      clearInterval(poll)
      off()
    }
  }, [settings, refreshWindow])

  const loadMore = useCallback(async () => {
    const win = await dbQueryItems(PAGE_SIZE, items.length)
    setItems((prev) => {
      const ids = new Set(prev.map((i) => i.id))
      const merged = [...prev, ...win.filter((i) => !ids.has(i.id))]
      // keep sorted by pubDate desc
      merged.sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
      setAllLoaded(allLoaded || count <= merged.length)
      return merged
    })
  }, [items, allLoaded, count])

  const actions = {
    setRead: useCallback(
      (item: NewsItem, unread: boolean) => setRead(settings!, item, unread),
      [settings],
    ),
    setStar: useCallback(
      (item: NewsItem, starred: boolean) => setStar(settings!, item, starred),
      [settings],
    ),
    reset: useCallback(async () => {
      await resetLocal()
      setReady(false)
      setItems([])
      setAllLoaded(false)
      // wipe UI; next load re-hydrates
    }, []),
  }

  // subscribe to progress
  useEffect(() => {
    const tick = () => {
      const s = getStatus()
      if (s.stage === 'fetching') setProgress({ done: s.done })
      else if (s.stage === 'done') setProgress(null)
    }
    tick()
    const off = onStoreChange(tick)
    return off
  }, [])

  return {
    ready,
    items,
    feeds,
    folders,
    count,
    allLoaded,
    progress,
    error,
    loadMore,
    actions,
  }
}

export interface Bundle {
  store: ReturnType<typeof useStore>
}