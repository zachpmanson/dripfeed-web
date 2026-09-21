import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { NewsFeed } from '../api/types'
import type { Settings } from '../settings'
import { setFeedFullText } from '../actions'

interface Props {
  feed: NewsFeed
  settings: Settings
  onClose: () => void
  onChanged: () => void // refresh sidebar meta after a write
}

/**
 * Per-feed settings, opened from the feed row's right-click menu. The first
 * setting is "Default to extracting full article", which is the News
 * server's own per-feed `fullTextEnabled` flag rather than a web-only
 * preference: turning it on makes the server scrape new items at fetch time
 * (full bodies arrive already extracted, and other clients — the Android
 * app — see them too), while the web reader uses the same flag to extract
 * on open for items that predate it. One toggle, one source of truth.
 *
 * The write is optimistic (actions.setFeedFullText writes the local feed row
 * first) and reverted on failure, so this only has to own its own in-flight
 * and error state.
 *
 * Portalled to <body>: it is opened from a sidebar feed row, so rendered in
 * place it would sit inside the sidebar's <nav> — where `.sidebar button`
 * (the feed-row rule) claims its close button and stretches the ✕ across the
 * whole modal head. The other modals are already App-level; a portal keeps
 * this one out of that subtree instead of adding another width patch to the
 * row rule (the folder caret carries one of those already).
 */
export function FeedSettingsModal({ feed, settings, onClose, onChanged }: Props) {
  // Seeded from the feed row, then owned locally: the row object is replaced
  // by every poll reconcile, and re-seeding from it would fight the toggle.
  // `?? false` covers rows mirrored before this field existed (IndexedDB
  // persists across deploys, so older rows lack it until the next /feeds).
  const [enabled, setEnabled] = useState(feed.fullTextEnabled ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (next: boolean) => {
    if (busy) return
    const prev = enabled
    setEnabled(next)
    setBusy(true)
    setError(null)
    try {
      await setFeedFullText(settings, feed.id, next)
      onChanged()
    } catch (e) {
      setEnabled(prev)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="muted">Feed settings — {feed.title}</span>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="settings-form">
          <div className="setting-row">
            <label className="setting-label checkbox">
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy}
                onChange={(e) => void toggle(e.target.checked)}
              />
              Default to extracting full article
            </label>
          </div>
          <div className="setting-row">
            <span className="muted hint">
              Items from this feed open as the full article. Also asks the server to
              scrape new items when the feed updates, so other clients show full text too.
              Existing items are extracted as you open them.
            </span>
          </div>
          {error && <div className="error">{error}</div>}
          {busy && <div className="muted hint">Working…</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}