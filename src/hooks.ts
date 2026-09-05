import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fullSync, incrementalSync, isInitialized, isDbReady, loadAllItems,
  loadFeeds, loadFolders, loadMoreInto, onStoreChange, getStatus, resetLocal,
} from './store'
import { setRead, setStar } from './actions'
import { dbGetCursor } from './db'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'
import type { Settings } from './settings'
import type { View } from './components/Sidebar'

const RENDER_STEP = 60 // items to reveal per load-more

export interface AppData {
  ready: boolean
  pool: NewsItem[] // full local mirror (sorted newest-first)
  feeds: Map<number, NewsFeed>
  folders: NewsFolder[]
  rendered: number // how many of the sorted pool to show
  moreAvailable: boolean
  loadingMore: boolean
  progress: { done: number } | null
  error: string | null
  loadMore: () => Promise<void>
  cursors: Map<number, number> // per-feed paging cursors (-1 = drained)
  actions: {
    setRead: (item: NewsItem, unread: boolean) => Promise<void>
    setStar: (item: NewsItem, starred: boolean) => Promise<void>
    reset: () => Promise<void>
  }
}

/**
 * Owns the whole data lifecycle: per-feed hydration into IndexedDB on first
 * run, instant reads from the DB, growing server pool + render window via
 * loadMore, background poll.
 */
export function useStore(settings: Settings | null, view: View): AppData {
  const [ready, setReady] = useState(false)
  const [pool, setPool] = useState<NewsItem[]>([])
  const [feeds, setFeeds] = useState<Map<number, NewsFeed>>(new Map())
  const [folders, setFolders] = useState<NewsFolder[]>([])
  const [rendered, setRendered] = useState(RENDER_STEP)
  const [moreAvailable, setMoreAvailable] = useState(false)
  const [cursors, setCursors] = useState<Map<number, number>>(new Map())
  const [loadingMore, setLoadingMore] = useState(false)
  const [progress, setProgress] = useState<{ done: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const viewRef = useRef<View>(view)
  viewRef.current = view
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const refreshPool = useCallback(async () => {
    const [all, fs, fo] = await Promise.all([loadAllItems(), loadFeeds(), loadFolders()])
    all.sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
    setPool(all)
    setFeeds(new Map(fs.map((f) => [f.id, f])))
    setFolders(fo)
    // Cache every feed's cursor so the UI can derive per-view moreServer
    // synchronously (a stale boolean computed under another view hid the
    // load-more button on all-read feeds after switching views).
    const cm = new Map<number, number>()
    for (const f of fs) {
      const c = await dbGetCursor(f.id)
      if (c !== undefined) cm.set(f.id, c)
    }
    setCursors(cm)
    setMoreAvailable(all.length > rendered)
  }, [rendered])

  // hydrate / poll
  useEffect(() => {
    if (!settings) return
    let cancelled = false

    const off = onStoreChange(() => {
      if (!cancelled) void refreshPool()
    })

    ;(async () => {
      if (await isInitialized()) {
        await refreshPool()
        setReady(true)
        try {
          await incrementalSync(settings)
          if (!cancelled) await refreshPool()
        } catch (e) {
          console.warn('incremental sync failed', e)
        }
      } else {
        try {
          await fullSync(settings)
          if (cancelled) return
          await refreshPool()
          setReady(true)
        } catch (e) {
          if (!cancelled) setError(String(e))
        }
      }
    })()

    const poll = setInterval(() => {
      if (isDbReady() && settingsRef.current) {
        incrementalSync(settingsRef.current)
          .then(() => refreshPool())
          .catch((e) => console.warn('poll sync failed', e))
      }
    }, 3 * 60_000)

    return () => {
      cancelled = true
      clearInterval(poll)
      off()
    }
  }, [settings, refreshPool])

  const loadMore = useCallback(async () => {
    const s = settingsRef.current
    if (!s || loadingMore) return
    setLoadingMore(true)
    try {
      const v = viewRef.current
      const feedId =
        v.kind === 'feed'
          ? (v.id as number)
          : v.kind === 'folder'
            ? undefined /* load all feeds of the folder */
            : undefined
      await loadMoreInto(s, feedId)
      await refreshPool()
      setRendered((r) => r + RENDER_STEP)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, refreshPool])

  const actions = useCallback(
    () => ({
      setRead: (item: NewsItem, unread: boolean) => setRead(settingsRef.current!, item, unread),
      setStar: (item: NewsItem, starred: boolean) => setStar(settingsRef.current!, item, starred),
      reset: async () => {
        await resetLocal()
        setReady(false)
        setPool([])
        setRendered(RENDER_STEP)
        setMoreAvailable(false)
      },
    }),
    [],
  )

  // progress subscription
  useEffect(() => {
    const tick = () => {
      const st = getStatus()
      if (st.stage === 'fetching') setProgress({ done: st.done })
      else if (st.stage === 'done') setProgress(null)
    }
    tick()
    return onStoreChange(tick)
  }, [])

  return {
    ready,
    pool,
    feeds,
    folders,
    rendered,
    moreAvailable,
    cursors,
    loadingMore,
    progress,
    error,
    loadMore,
    actions: actions(),
  }
}