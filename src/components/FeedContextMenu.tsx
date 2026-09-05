import { useState } from 'react'
import type { NewsFeed, NewsFolder } from '../api/types'
import type { Settings } from '../settings'
import { deleteFeed, moveFeed } from '../api/news'

interface Props {
  feed: NewsFeed
  folders: NewsFolder[]
  settings: Settings
  x: number
  y: number
  onClose: () => void
  onChanged: () => void // refresh sidebar meta after delete/move
}

/**
 * Right-click menu on a feed row: delete the feed, or move it to another
 * folder (opens a picker popup). Both hit the News API then refresh meta.
 */
export function FeedContextMenu({ feed, folders, settings, x, y, onClose, onChanged }: Props) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doDelete = async () => {
    if (busy) return
    if (!confirm(`Delete feed "${feed.title}" and its items?`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteFeed(settings, feed.id)
      onChanged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const doMove = async (folderId: number | null) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await moveFeed(settings, feed.id, folderId)
      onChanged()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div
      className="ctx-backdrop"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        className="ctx-menu"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        {picking ? (
          <>
            <div className="ctx-title">Move "{feed.title}" to…</div>
            <button className="ctx-item" onClick={() => doMove(null)}>
              no folder
            </button>
            {folders.map((f) => (
              <button key={f.id} className="ctx-item" onClick={() => doMove(f.id)}>
                {f.name}
              </button>
            ))}
            <button className="ctx-item muted" onClick={() => setPicking(false)}>
              back
            </button>
          </>
        ) : (
          <>
            <button className="ctx-item" onClick={() => setPicking(true)}>
              move to folder…
            </button>
            <button className="ctx-item danger" onClick={doDelete}>
              delete
            </button>
          </>
        )}
        {error && <div className="error ctx-error">{error}</div>}
        {busy && <div className="muted ctx-busy">working…</div>}
      </div>
    </div>
  )
}