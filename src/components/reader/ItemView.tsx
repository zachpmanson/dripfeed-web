import { useEffect, useMemo, useRef, useState } from 'react'
import { enclosureHtml } from '../../utils'
import { dimRepeatedChunks } from '../../boilerplate'
import type { NewsItem } from '../../api/types'
import type { useStore } from '../../hooks'
import { sanitizeArticleCss } from '../../theme'
import ReaderHeader from './ReaderHeader'
import type { ArticleCssMode } from '../../theme'

/**
 * A `<base href>` for the srcdoc article frame. Feed bodies legitimately
 * contain relative links and images (root-relative `/party-tricks/`, or
 * `../site/metadata.html` — valid RSS, even if uncommon). The srcdoc frame
 * has no URL of its own, so without a base those would resolve against the
 * app's origin (or not at all). The article URL is the correct base:
 * relative paths resolve exactly as they would on the original page.
 * Returns '' when the item URL isn't an absolute http(s) URL (nothing sane
 * to resolve against). Attribute-escaped for srcdoc interpolation.
 */
function baseHrefFor(url: string | null | undefined): string {
  if (!url) return ''
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return ''
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
  const escaped = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return `<base href="${escaped}">`
}

interface Props {
  item: NewsItem | null
  feedTitle: (feedId: number) => string
  actions: ReturnType<typeof useStore>['actions']
  articleCssMode: ArticleCssMode
  articleCss: string
  dimBoilerplate: boolean
  recentBodies: string[]
  /** True when the selected item's feed defaults to the extracted article
   *  (the feed's News `fullTextEnabled` flag). Drives the auto-extract below
   *  and, when it flips on while an item is open, that item's extraction. */
  autoExtract: boolean
  /** Called when the reader header's feed name is clicked — switch the
   *  item list to that feed. */
  onFeedClick: (feedId: number) => void
}

/**
 * Items this session has already auto-extracted, keyed by item id, holding
 * the in-flight promise. Module-level rather than component state for three
 * reasons: the poll replaces the item OBJECT every few minutes, so effect
 * state keyed on the object would re-scrape forever; re-selecting an item
 * must not re-scrape it; and the stored promise single-flights the server
 * scrape (~6s, capped server-side) when walking quickly down a feed instead
 * of stacking one request per item.
 */
const autoExtracted = new Map<number, Promise<void>>()

export function ItemView({
  item,
  feedTitle,
  actions,
  articleCssMode,
  articleCss,
  dimBoilerplate,
  recentBodies,
  autoExtract,
  onFeedClick,
}: Props) {
  // Ref to the sandboxed article iframe so we can reach its document.
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [themeRevision, setThemeRevision] = useState(0)

  // The system theme can change without a React render. Watch the app's theme
  // attribute so the isolated article document receives the updated tokens.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeRevision((revision) => revision + 1))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  // Same-document anchors (e.g. footnotes: href="#fn:1") are blocked by the
  // sandbox — fragment-only navigation is suppressed. Since the frame is
  // allow-same-origin, the PARENT can read its document and scroll instead.
  // Attached on every iframe load (a new srcdoc swaps the whole document).
  const attachFrameNav = () => {
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    const onClick = (e: MouseEvent) => {
      // Iframe elements belong to a different realm, so parent-window
      // instanceof checks fail. Use DOM properties to find the HTML anchor.
      const clicked = e.target as Element | null
      let node = clicked?.nodeType === 1 ? clicked : null
      while (node && node.tagName !== 'A') node = node.parentElement
      const a = node
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
  // Id of the item on screen, read by an in-flight run's finally/catch so a
  // scrape that lands after the user moved on cannot paint its spinner or
  // its error onto a different article.
  const currentItemIdRef = useRef<number | null>(null)
  useEffect(() => {
    currentItemIdRef.current = item?.id ?? null
    setExtracting(false)
    setExtractError(null)
  }, [item?.id])
  // One counter for both extraction paths: a finishing scrape must not clear
  // the spinner of a newer one (auto-extract while walking down a feed, or a
  // manual click landing while an auto pass runs). Only the newest run owns
  // the spinner's off state.
  const extractSeq = useRef(0)
  const runExtract = async (target: NewsItem) => {
    const seq = ++extractSeq.current
    setExtracting(true)
    setExtractError(null)
    try {
      await actions.extractFulltext(target)
    } catch (e) {
      if (currentItemIdRef.current === target.id) {
        setExtractError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      if (extractSeq.current === seq) setExtracting(false)
    }
  }

  // Feed default: opening an item from a feed flagged for full text extracts
  // it without a click. Deps are item.id (not the item object, which every
  // poll rebuilds) and autoExtract, so flipping the flag on while an item
  // from that feed is open extracts it too. A failure is reported in the
  // header banner like a manual one, but is only ever attempted once per
  // item per session — a feed that cannot be scraped must not retry in a loop.
  //
  // Note this can be a redundant scrape when the SERVER already scraped the
  // item at fetch time (feed.fullTextEnabled makes it do so): the item body
  // carries no marker saying where it came from. The cost is one server-side
  // fetch of the article URL per item opened, and the body swap is invisible
  // when the content is the same.
  useEffect(() => {
    if (!item || !autoExtract) return
    const { id } = item
    if (autoExtracted.has(id)) return
    autoExtracted.set(id, runExtract(item))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, autoExtract])
  const srcdoc = useMemo(() => {
    if (!item) return ''
    // Body comes from the server already rewritten with target=_blank.
    // srcdoc + sandbox keeps third-party feed HTML from touching the app.
    // allow-popups(-to-escape-sandbox) lets those target=_blank links open
    // in a real new tab — without it the sandbox silently swallows them.
    // Relative links/images (valid in RSS) resolve against a <base> pointing
    // at the article URL; the server has historically dropped them instead
    // (nextcloud/news #3822), but when they survive this makes them work.
    //
    // srcdoc is a separate document and cannot inherit the app's custom
    // properties. Resolve the existing theme tokens here and pass their
    // computed values into the frame, keeping one palette source of truth.
    const appTheme = getComputedStyle(document.documentElement)
    const panel = appTheme.getPropertyValue('--panel').trim()
    const text = appTheme.getPropertyValue('--text').trim()
    const accent = appTheme.getPropertyValue('--accent').trim()
    const border = appTheme.getPropertyValue('--border').trim()
    const colorScheme = appTheme.colorScheme
    const body = dimBoilerplate ? dimRepeatedChunks(item.body, recentBodies) : item.body
    // Custom CSS must be resource-free AND HTML-raw-text-safe at this style sink.
    return `<!doctype html><html data-theme-revision="${themeRevision}"><head><meta charset="utf-8">${baseHrefFor(item.url)}<style>
      :root { color-scheme: ${colorScheme}; --panel: ${panel}; --text: ${text}; --accent: ${accent}; --border: ${border}; }
      body { font-family: Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif; font-weight: normal; line-height: 1.55; max-width: 46rem; margin: 0 auto; padding: 0.5rem 1rem; color: var(--text); background: var(--panel); overflow-wrap: anywhere; word-break: break-word; }
      img, video { max-width: 100%; height: auto; }
      .enclosure { display: block; margin: 0.9rem 0 0; max-width: 100%; }
      pre { max-width: 100%; overflow-x: auto; }
      table { display: block; width: max-content; max-width: calc(100vw - 2rem); overflow-x: auto; margin-left: calc(50% - 50vw + 1rem); }
      table, th, td { border: 1px solid var(--border); border-collapse: collapse; }
      th, td { padding: 0.3rem 0.5rem; }
      a { color: var(--accent); overflow-wrap: anywhere; word-break: break-word; }
      .footnote-flash { outline: 2px solid var(--accent); outline-offset: 2px; }
    </style>
    ${articleCssMode === 'custom' && articleCss ? `<style>${sanitizeArticleCss(articleCss)}</style>` : ''}
    ${dimBoilerplate ? '<style>.dim-boilerplate { opacity: 0.15; }</style>' : ''}</head><body>${body}${enclosureHtml(item)}</body></html>`
  }, [item, articleCssMode, articleCss, dimBoilerplate, recentBodies, themeRevision])

  if (!item) {
    return (
      <div className="flex min-h-0 flex-col items-center justify-center overflow-y-auto p-6 text-app-muted">
        Select an item
      </div>
    )
  }

  const handleExtract = async () => {
    if (extracting) return
    await runExtract(item)
  }

  return (
    <article className="flex min-h-0 flex-col overflow-y-auto p-4 md:px-6">
      <ReaderHeader
        item={item}
        actions={actions}
        extracting={extracting}
        extractError={extractError}
        autoExtract={autoExtract}
        onExtract={() => void handleExtract()}
      />
      <div className="mb-4 flex items-baseline gap-2 text-xs text-app-muted">
        <button
          className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent p-0 text-xs text-app-accent hover:underline"
          title={`${feedTitle(item.feedId)} — show this feed`}
          onClick={() => onFeedClick(item.feedId)}
        >
          {feedTitle(item.feedId)}
        </button>
        {item.author && <span className="text-app-muted">by {item.author}</span>}
        <span className="ml-auto text-right text-app-muted">
          {item.pubDate ? new Date(item.pubDate).toLocaleString() : ''}
        </span>
      </div>
      {extractError && (
        <div className="mb-4 text-xs text-app-danger" role="alert">
          Full article unavailable — {extractError}
        </div>
      )}

      <iframe
        ref={frameRef}
        className="min-h-[20rem] w-full flex-1 rounded-md border border-app-border bg-app-panel"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcdoc}
        title={item.title}
        onLoad={attachFrameNav}
      />
    </article>
  )
}
