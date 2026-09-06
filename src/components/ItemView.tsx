import { useEffect, useMemo, useRef, useState } from 'react'
import { titleFor } from '../utils'
import type { NewsItem } from '../api/types'
import type { useStore } from '../hooks'
import { effectiveTheme, sanitizeArticleCss, type ThemeSetting } from '../theme'
import { IconButton } from './IconButton'
import type { ArticleCssMode } from '../theme'

interface Props {
  item: NewsItem | null
  feedTitle: (feedId: number) => string
  actions: ReturnType<typeof useStore>['actions']
  articleTheme: ThemeSetting
  articleCssMode: ArticleCssMode
  articleCss: string
}

export function ItemView({ item, feedTitle, actions, articleTheme, articleCssMode, articleCss }: Props) {
  // Ref to the sandboxed article iframe so we can reach its document.
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  // Same-document anchors (e.g. footnotes: href="#fn:1") are blocked by the
  // sandbox — fragment-only navigation is suppressed. Since the frame is
  // allow-same-origin, the PARENT can read its document and scroll instead.
  // Attached on every iframe load (a new srcdoc swaps the whole document).
  const attachFrameNav = () => {
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    const onClick = (e: MouseEvent) => {
      // Walk up from the click target to the enclosing anchor, if any.
      let node: Element | null = e.target instanceof Element ? e.target : null
      while (node && !(node instanceof HTMLAnchorElement)) node = node.parentElement
      const a = node as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      if (!href.startsWith('#')) return // external links already target=_blank
      e.preventDefault()
      const target = doc.getElementById(href.slice(1))
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      target.classList.add('footnote-flash')
      window.setTimeout(() => target.classList.remove('footnote-flash'), 1200)
    }
    // A reload swaps the document; remove-then-add keeps one listener per doc.
    doc.removeEventListener('click', onClick)
    doc.addEventListener('click', onClick)
  }

  // Full-article extraction state: per selected item, reset on change.
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  useEffect(() => {
    setExtracting(false)
    setExtractError(null)
  }, [item?.id])
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
      img, video { max-width: 100%; height: auto; }
      table, th, td { border: 1px solid #000; border-collapse: collapse; }
      th, td { padding: 0.3rem 0.5rem; }
      a { color: var(--link); overflow-wrap: anywhere; word-break: break-word; }
      .footnote-flash { outline: 2px solid var(--link); outline-offset: 2px; }
    </style>
    ${articleCssMode === 'custom' && articleCss ? `<style>${sanitizeArticleCss(articleCss)}</style>` : ''}</head><body>${item.body}</body></html>`
  }, [item, articleTheme, articleCssMode, articleCss])

  if (!item) {
    return <div className="reader empty muted">Select an item</div>
  }

  const handleExtract = async () => {
    if (extracting) return
    setExtracting(true)
    setExtractError(null)
    try {
      await actions.extractFulltext(item)
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : String(e))
    } finally {
      setExtracting(false)
    }
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
          <IconButton
            title={item.unread ? 'Mark read' : 'Mark unread'}
            onClick={() => actions.setRead(item, !item.unread)}
          >
            {item.unread ? '○' : '●'}
          </IconButton>
          <IconButton
            title={item.starred ? 'Unstar' : 'Star'}
            onClick={() => actions.setStar(item, !item.starred)}
          >
            {item.starred ? '★' : '☆'}
          </IconButton>
          <IconButton
            title={
              extractError
                ? `Extract full article — ${extractError}`
                : 'Extract full article from the original URL'
            }
            disabled={extracting}
            onClick={() => void handleExtract()}
          >
            {extracting ? (
              <span className="spinner" />
            ) : (
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3.5" y="2" width="9" height="12" rx="1" />
                <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
              </svg>
            )}
          </IconButton>
        </div>
      </div>
      <div className="item-meta">
        <span className="feed">{feedTitle(item.feedId)}</span>
        {item.author && <span className="muted">by {item.author}</span>}
        <span className="muted">{item.pubDate ? new Date(item.pubDate).toLocaleString() : ''}</span>
      </div>
      {extractError && (
        <div className="extract-error" role="alert">
          Full article unavailable — {extractError}
        </div>
      )}

      <iframe
        ref={frameRef}
        className={`reader-frame${articleDark ? ' dark' : ''}`}
        sandbox="allow-same-origin"
        srcDoc={srcdoc}
        title={item.title}
        onLoad={attachFrameNav}
      />
    </article>
  )
}