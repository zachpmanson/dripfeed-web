import { useMemo } from 'react'
import { titleFor } from './ItemList'
import type { NewsItem } from '../api/types'
import type { useStore } from '../hooks'
import { effectiveTheme, type ThemeSetting } from '../theme'

interface Props {
  item: NewsItem | null
  feedTitle: (feedId: number) => string
  actions: ReturnType<typeof useStore>['actions']
  articleTheme: ThemeSetting
}

export function ItemView({ item, feedTitle, actions, articleTheme }: Props) {
  // Only used for the iframe element's own background while srcdoc loads;
  // the article colours themselves live in CSS inside the frame (below).
  const articleDark = effectiveTheme(articleTheme) === 'dark'

  const srcdoc = useMemo(() => {
    if (!item) return ''
    // Body comes from the server already rewritten with target=_blank.
    // srcdoc + sandbox keeps third-party feed HTML from touching the app.
    //
    // The palette is real CSS, not baked hex, so the frame answers to
    // `prefers-color-scheme` like any normal page: light tokens are the
    // default, a media block swaps in the dark tokens, and
    // `color-scheme: light dark` flips the UA default canvas/widget palette
    // too. When the user picked an explicit article theme in the app, a
    // `data-theme` attribute on <html> wins over the media block (attribute
    // selectors out-rank it), so that choice sticks regardless of the OS
    // scheme. Both levers are exactly what DevTools' scheme emulation and
    // the Force Color Scheme extension can reach — the frame no longer needs
    // the app to re-render to change palette.
    const explicit = articleTheme !== 'system'
    const dataTheme = explicit
      ? articleTheme === 'dark'
        ? ' data-theme="dark"'
        : ' data-theme="light"'
      : ''
    return `<!doctype html><html${dataTheme}><head><meta charset="utf-8"><style>
      :root { color-scheme: light dark; }
      :root { --bg: #fff; --fg: #111; --link: #1a4fb8; --border: #d9dce2; }
      @media (prefers-color-scheme: dark) {
        :root { --bg: #16181d; --fg: #d8dce3; --link: #7cb2ff; --border: #2a2e37; }
      }
      :root[data-theme="light"] { --bg: #fff; --fg: #111; --link: #1a4fb8; --border: #d9dce2; }
      :root[data-theme="dark"] { --bg: #16181d; --fg: #d8dce3; --link: #7cb2ff; --border: #2a2e37; }
      body { font-family: Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif; font-weight: normal; line-height: 1.55; max-width: 46rem; margin: 0 auto; padding: 0.5rem 1rem; color: var(--fg); background: var(--bg); overflow-wrap: anywhere; word-break: break-word; }
      img { max-width: 100%; height: auto; }
      table, th, td { border: 1px solid #000; border-collapse: collapse; }
      th, td { padding: 0.3rem 0.5rem; }
      a { color: var(--link); overflow-wrap: anywhere; word-break: break-word; }
    </style></head><body>${item.body}</body></html>`
  }, [item, articleTheme])

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
      <iframe
        className={`reader-frame${articleDark ? ' dark' : ''}`}
        sandbox="allow-same-origin"
        srcDoc={srcdoc}
        title={item.title}
      />
    </article>
  )
}