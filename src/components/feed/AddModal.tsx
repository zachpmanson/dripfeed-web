import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { NewsFolder } from '../../api/types'
import type { Settings } from '../../settings'
import { createFeed, createFolder } from '../../api/news'

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
    <div className="fixed inset-0 z-[1000] bg-black/45" onClick={onClose}>
      <div
        className="fixed left-1/2 top-1/2 z-[1001] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-app-border bg-app-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between uppercase tracking-[0.06em]">
          <span className="text-app-muted">Add</span>
          <button
            className="inline-flex items-center justify-center rounded p-1 text-app-muted hover:bg-app-border hover:text-app-text"
            onClick={onClose}
            aria-label="close"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mb-4 flex overflow-hidden rounded-md border border-app-border">
          <button
            className={`rounded-none border-0 px-2.5 py-1.5 text-sm ${tab === 'feed' ? 'bg-app-accent font-semibold text-app-on-accent' : 'bg-transparent text-app-muted'}`}
            onClick={() => setTab('feed')}
          >
            Feed
          </button>
          <button
            className={`rounded-none border-0 px-2.5 py-1.5 text-sm ${tab === 'folder' ? 'bg-app-accent font-semibold text-app-on-accent' : 'bg-transparent text-app-muted'}`}
            onClick={() => setTab('folder')}
          >
            Folder
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
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
                <select
                  value={folderId ?? 0}
                  onChange={(e) => setFolderId(Number(e.target.value) || null)}
                >
                  <option value={0}>No folder</option>
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
          <button
            className="cursor-pointer rounded-md border-0 bg-app-accent p-2.5 font-semibold text-app-on-accent disabled:cursor-default disabled:opacity-60"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Adding…' : tab === 'feed' ? 'Add feed' : 'Create folder'}
          </button>
        </form>
      </div>
    </div>
  )
}
