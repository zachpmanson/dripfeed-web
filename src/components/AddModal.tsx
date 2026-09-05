import { useState } from 'react'
import type { NewsFolder } from '../api/types'
import type { Settings } from '../settings'
import { createFeed, createFolder } from '../api/news'

interface Props {
  folders: NewsFolder[]
  settings: Settings
  onClose: () => void
  onCreated: (kind: 'feed' | 'folder') => void
}

type Tab = 'feed' | 'folder'

/**
 * "+" modal in the header: add a new feed (URL + optional folder) or create
 * a new folder. Both POST to the News API; onCreated triggers a meta
 * refresh so the sidebar picks up the new item.
 */
export function AddModal({ folders, settings, onClose, onCreated }: Props) {
  const [tab, setTab] = useState<Tab>('feed')
  const [url, setUrl] = useState('')
  const [folderId, setFolderId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      if (tab === 'feed') {
        if (!url.trim()) throw new Error('Enter a feed URL')
        await createFeed(settings, url.trim(), folderId)
        setDone('Feed added.')
        onCreated('feed')
      } else {
        if (!name.trim()) throw new Error('Enter a folder name')
        await createFolder(settings, name.trim())
        setDone('Folder created.')
        onCreated('folder')
      }
      setUrl('')
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="muted">add</span>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="seg modal-tabs">
          <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>
            feed
          </button>
          <button className={tab === 'folder' ? 'active' : ''} onClick={() => setTab('folder')}>
            folder
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          {tab === 'feed' ? (
            <>
              <label className="field">
                URL
                <input
                  autoFocus
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/feed.xml"
                />
              </label>
              <label className="field">
                Folder
                <select value={folderId ?? 0} onChange={(e) => setFolderId(Number(e.target.value) || null)}>
                  <option value={0}>no folder</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="field">
              Name
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My folder"
              />
            </label>
          )}
          {error && <div className="error">{error}</div>}
          {done && <div className="ok">{done}</div>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'adding…' : tab === 'feed' ? 'add feed' : 'create folder'}
          </button>
        </form>
      </div>
    </div>
  )
}