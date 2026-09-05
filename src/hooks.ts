import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { news, syncNews } from './store'
import { markRead, markUnread, setStar } from './api/news'
import type { NewsItem } from './api/types'
import type { Settings } from './settings'

/** Loads feeds + full item history into the in-memory store, then polls. */
export function useNews(settings: Settings | null) {
  const query = useQuery({
    queryKey: ['news'],
    queryFn: () => syncNews(settings!),
    enabled: !!settings,
    refetchInterval: 3 * 60_000, // 3 min incremental poll
    staleTime: 60_000,
  })
  return { ...query, data: query.data ?? news }
}

/** Shared read/star actions: mutate server, then the in-memory store. */
export function useNewsActions(settings: Settings | null) {
  const queryClient = useQueryClient()

  const applyItem = (id: number, mutate: (i: NewsItem) => NewsItem) => {
    const it = news.items.get(id)
    if (it) news.items.set(id, mutate(it))
    // New object ref so react-query subscribers re-render.
    queryClient.setQueryData(['news'], { ...news })
  }

  const toggleRead = useMutation({
    mutationFn: ({ id, unread }: { id: number; unread: boolean }) => {
      if (!settings) return Promise.resolve()
      return unread ? markRead(settings, id) : markUnread(settings, id)
    },
    onMutate: ({ id, unread }) => applyItem(id, (i) => ({ ...i, unread: !unread })),
  })

  const toggleStar = useMutation({
    mutationFn: ({ id }: { id: number }) => {
      if (!settings) return Promise.resolve()
      return setStar(settings, id)
    },
    onMutate: ({ id }) => applyItem(id, (i) => ({ ...i, starred: !i.starred })),
  })

  return { toggleRead, toggleStar }
}