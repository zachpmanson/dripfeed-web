import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fullSync, incrementalSync, isInitialized, isDbReady, loadAllItems,
  loadFeeds, loadFolders, loadMoreInto, ensureFeedWindow, ensureUnreadScope,
  unreadScopeKey, onStoreChange, getStatus, resetLocal,
  type LoadMoreProgress,
} from './store'
import { setRead, setStar, extractFulltext, isAuthFailure } from './actions'
import { isAuthError } from './api/client'
import { dbGetCursor } from './db'
import type { NewsFeed, NewsFolder, NewsItem } from './api/types'
import type { Settings } from './settings'
import type { View } from './components/Sidebar'

export interface AppData {
  ready: boolean
  pool: NewsItem[] // full local mirror (sorted newest-first)
  feeds: Map<number, NewsFeed>
  folders: NewsFolder[]
  loadingMore: boolean
  paging: LoadMoreProgress | null // per-feed progress while paging
  progress: { done: number } | null
  error: string | null
  /** Set when the server rejected our credentials (401) — the app should
   *  drop back to the settings form. */
  authFailed: boolean
  loadMore: () => Promise<void>
  cursors: Map<number, number> // per-feed paging cursors (-1 = drained)
  unreadDrained: Set<string> // scopes probed for unread via getRead=false
  actions: {
    setRead: (item: NewsItem, unread: boolean) => Promise<void>
    setStar: (item: NewsItem, starred: boolean) => Promise<void>
    extractFulltext: (item: NewsItem) => Promise<void>
    ensureFeed: (feedId: number) => Promise<void>
    ensureUnread: (type: 0 | 1, id: number) => Promise<number>
    refreshMeta: () => Promise<void>
    reset: () => Promise<void>
  }
}

/**
 * Owns the whole data lifecycle: per-feed hydration into IndexedDB on first
 * run, instant reads from the DB, growing server pool + render window via
 * loadMore, background poll.
 */
export function useStore(
  settings: Settings | null,
  view: View,
  unreadOnly: boolean,
): AppData {
  const [ready, setReady] = useState(false)
  const [pool, setPool] = useState<NewsItem[]>([])
  const [feeds, setFeeds] = useState<Map<number, NewsFeed>>(new Map())
  const [folders, setFolders] = useState<NewsFolder[]>([])
  const [cursors, setCursors] = useState<Map<number, number>>(new Map())
  const [loadingMore, setLoadingMore] = useState(false)
  const [paging, setPaging] = useState<LoadMoreProgress | null>(null)
  const [progress, setProgress] = useState<{ done: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authFailed, setAuthFailed] = useState(false)
  const viewRef = useRef<View>(view)
  viewRef.current = view
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const unreadOnlyRef = useRef(unreadOnly)
  unreadOnlyRef.current = unreadOnly
  const [unreadDrained, setUnreadDrained] = useState<Set<string>>(new Set())

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
  }, [])

  // Invalidate credentials permanently: wipe local state AND stored
  // settings, then flag authFailed so App drops back to the settings form.
  const resetToSettings = useCallback(async () => {
    await resetLocal()
    setReady(false)
    setPool([])
    setUnreadDrained(new Set())
    setAuthFailed(true)
  }, [])

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
          if (isAuthError(e)) {
            await resetToSettings()
            return
          }
          console.warn('incremental sync failed', e)
        }
      } else {
        try {
          await fullSync(settings)
          if (cancelled) return
          await refreshPool()
          setReady(true)
        } catch (e) {
          if (cancelled) return
          if (isAuthError(e)) {
            await resetToSettings()
            return
          }
          setError(String(e))
        }
      }
    })()

    const poll = setInterval(() => {
      if (isDbReady() && settingsRef.current) {
        incrementalSync(settingsRef.current)
          .then(() => refreshPool())
          .catch((e) => {
            if (isAuthError(e)) {
              void resetToSettings()
              return
            }
            console.warn('poll sync failed', e)
          })
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
    const v = viewRef.current
    // In unread-only mode, feed/folder scopes are served by the native
    // unread query (getRead=false, no server limit) — the whole unread set
    // arrives in one request and there is never a history walk here. If the
    // probe hasn't landed yet, the ensureUnread effect owns it; skip.
    if (
      unreadOnlyRef.current &&
      (v.kind === 'feed' || v.kind === 'folder')
    ) {
      return
    }
    setLoadingMore(true)
    try {
      // In-scope feeds for this view: a feed view pages just that feed; a
      // folder view pages its members; all/unread/starred page every feed.
      const scope =
        v.kind === 'feed'
          ? [v.id]
          : v.kind === 'folder'
            ? [...feeds.values()].filter((f) => f.folderId === v.id).map((f) => f.id)
            : [...feeds.values()].map((f) => f.id)
      setPaging({ added: 0, feedsPaged: 0, totalFeeds: 0 })
      await loadMoreInto(s, scope, undefined, (p) => setPaging(p))
      await refreshPool()
    } finally {
      setLoadingMore(false)
      setPaging(null)
    }
  }, [loadingMore, refreshPool, feeds, unreadDrained])

  // Bounce to login when a user-triggered action (mark read/star/extract)
  // hits a stale credential: 401 or a bruteforce 429. Keeps the store in sync
  // with the resetToSettings path so the UI lands on the login form.
  const failAuth = useCallback(async (e: unknown) => {
    if (!isAuthFailure(e)) return false
    await resetToSettings()
    return true
  }, [resetToSettings])

  const actions = useCallback(
    () => ({
      setRead: async (item: NewsItem, unread: boolean) => {
        try {
          await setRead(settingsRef.current!, item, unread)
        } catch (e) {
          await failAuth(e)
          throw e
        }
      },
      setStar: async (item: NewsItem, starred: boolean) => {
        try {
          await setStar(settingsRef.current!, item, starred)
        } catch (e) {
          await failAuth(e)
          throw e
        }
      },
      extractFulltext: async (item: NewsItem) => {
        try {
          await extractFulltext(settingsRef.current!, item)
        } catch (e) {
          await failAuth(e)
          throw e
        }
      },
      ensureFeed: async (feedId: number) => {
        const s = settingsRef.current
        if (!s) return
        await ensureFeedWindow(s, feedId)
        await refreshPool()
      },
      /**
       * Pull the whole unread set for a feed/folder scope in one native
       * unread query and remember the scope as probed, so the UI stops
       * offering "load more" for it in unread-only mode. Returns how many
       * unread items the server had (0 = genuinely none).
       */
      ensureUnread: async (type: 0 | 1, id: number) => {
        const s = settingsRef.current
        if (!s) return 0
        const n = await ensureUnreadScope(s, type, id)
        // only mark probed once the query actually succeeded, so a transient
        // network failure doesn't permanently hide the unread items
        setUnreadDrained((prev) => new Set(prev).add(unreadScopeKey(type, id)))
        await refreshPool()
        return n
      },
      refreshMeta: async () => {
        const s = settingsRef.current
        if (!s) return
        await incrementalSync(s)
        await refreshPool()
      },
      reset: async () => {
        await resetLocal()
        setReady(false)
        setPool([])
        setUnreadDrained(new Set())
        setAuthFailed(false)
        setError(null)
      },
    }),
    [refreshPool],
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
    cursors,
    unreadDrained,
    loadingMore,
    paging,
    progress,
    error,
    authFailed,
    loadMore,
    actions: actions(),
  }
}