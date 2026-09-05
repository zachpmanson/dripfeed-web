import { useMemo } from 'react'
import { titleFor } from './ItemList'
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
      body { font-family: Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif; font-weight: normal; line-height: 1.55; max-width: 46rem; margin: 0 auto; padding: 1rem; color: #111; background: #fff; overflow-wrap: anywhere; word-break: break-word; }
      img { max-width: 100%; height: auto; }
      a { color: #1a4fb8; overflow-wrap: anywhere; word-break: break-word; }
    </style></head><body>${item.body}</body></html>`
  }, [item])

  if (!item) {
    return <div className="reader empty muted">Select an item</div>
  }

  return (
    <article className="reader">
      <div className="reader-head">
        <h2 className="reader-title">
          <a href={item.url} target="_blank" rel="noreferrer">
            {titleFor(item)}
          </a>
        </h2>
        <div className="reader-actions">
          <button
            className="icon-btn"
            title={item.unread ? 'mark read' : 'mark unread'}
            aria-label={item.unread ? 'mark read' : 'mark unread'}
            onClick={() => actions.setRead(item, !item.unread)}
          >
            {item.unread ? '○' : '●'}
          </button>
          <button
            className="icon-btn"
            title={item.starred ? 'unstar' : 'star'}
            aria-label={item.starred ? 'unstar' : 'star'}
            onClick={() => actions.setStar(item, !item.starred)}
          >
            {item.starred ? '★' : '☆'}
          </button>
        </div>
      </div>
      <div className="item-meta">
        <span className="feed">{feedTitle(item.feedId)}</span>
        {item.author && <span className="muted">by {item.author}</span>}
        <span className="muted">{item.pubDate ? new Date(item.pubDate).toLocaleString() : ''}</span>
      </div>
      <iframe className="reader-frame" sandbox="allow-same-origin" srcDoc={srcdoc} title={item.title} />
    </article>
  )
}