import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { NewsItem } from '../api/types'
import type { Settings } from '../settings'
import { markRead, markUnread, setStar } from '../api/news'

interface Props {
  item: NewsItem | null
  feedTitle: (feedId: number) => string
  settings: Settings
}

export function ItemView({ item, feedTitle, settings }: Props) {
  const queryClient = useQueryClient()
  const readMutation = useMutation({
    mutationFn: async (i: NewsItem) => {
      if (i.unread) await markRead(settings, i.id)
      else await markUnread(settings, i.id)
      return i
    },
    onSuccess: (i) => {
      queryClient.setQueryData<{ items: NewsItem[] }>(['items', 'unread'], (old) =>
        old ? { ...old, items: old.items.map((x) => (x.id === i.id ? { ...x, unread: !x.unread } : x)) } : old,
      )
    },
  })
  const starMutation = useMutation({
    mutationFn: (i: NewsItem) => setStar(settings, i.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items'] }),
  })

  const srcdoc = useMemo(() => {
    if (!item) return ''
    // Body comes from the server already rewritten with target=_blank.
    // srcdoc + sandbox keeps third-party feed HTML from touching the app.
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body { font-family: system-ui, sans-serif; line-height: 1.55; max-width: 46rem; margin: 0 auto; padding: 1rem; color: #111; background: #fff; }
      img { max-width: 100%; height: auto; }
      a { color: #1a4fb8; }
    </style></head><body>${item.body}</body></html>`
  }, [item])

  if (!item) {
    return <div className="reader empty muted">Select an item</div>
  }

  return (
    <article className="reader">
      <h2 className="reader-title">
        <a href={item.url} target="_blank" rel="noreferrer">
          {item.title || '(untitled)'}
        </a>
      </h2>
      <div className="item-meta">
        <span className="feed">{feedTitle(item.feedId)}</span>
        {item.author && <span className="muted">by {item.author}</span>}
        <span className="muted">{item.pubDate ? new Date(item.pubDate).toLocaleString() : ''}</span>
      </div>
      <div className="reader-actions">
        <button onClick={() => readMutation.mutate(item)}>
          {item.unread ? 'mark read' : 'mark unread'}
        </button>
        <button onClick={() => starMutation.mutate(item)}>{item.starred ? 'unstar' : 'star'}</button>
      </div>
      <iframe className="reader-frame" sandbox="allow-same-origin" srcDoc={srcdoc} title={item.title} />
    </article>
  )
}