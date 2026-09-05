import { useMemo } from 'react'
import type { NewsItem } from '../api/types'
import type { useStore } from '../hooks'

interface Props {
  item: NewsItem | null
  feedTitle: (feedId: number) => string
  actions: ReturnType<typeof useStore>['actions']
}

export function ItemView({ item, feedTitle, actions }: Props) {
  const srcdoc = useMemo(() => {
    if (!item) return ''
    // Body comes from the server already rewritten with target=_blank.
    // srcdoc + sandbox keeps third-party feed HTML from touching the app.
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body { font-family: Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif; font-weight: normal; line-height: 1.55; max-width: 46rem; margin: 0 auto; padding: 1rem; color: #111; background: #fff; }
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
        <button onClick={() => actions.setRead(item, !item.unread)}>
          {item.unread ? 'mark read' : 'mark unread'}
        </button>
        <button onClick={() => actions.setStar(item, !item.starred)}>
          {item.starred ? 'unstar' : 'star'}
        </button>
      </div>
      <iframe className="reader-frame" sandbox="allow-same-origin" srcDoc={srcdoc} title={item.title} />
    </article>
  )
}