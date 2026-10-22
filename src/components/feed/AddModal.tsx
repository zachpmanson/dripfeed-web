import { useEffect, useId, useRef, useState } from 'react'
import { Dialog } from '../ui/Dialog'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { NewsFolder } from '../../api/types'
import type { Settings } from '../../settings'
import { createFeed, createFolder } from '../../api/news'
import { supportsAppProxy } from '../../api/client'

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
  const titleId = useId()
  const authHintId = useId()
  const canUseFeedAuth = supportsAppProxy(settings)
  const inputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('feed')
  const [url, setUrl] = useState('')
  const [folderId, setFolderId] = useState<number | null>(null)
  const [useFeedAuth, setUseFeedAuth] = useState(false)
  const [feedUser, setFeedUser] = useState('')
  const [feedPassword, setFeedPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [tab])

  const clearFeedAuth = () => {
    setUseFeedAuth(false)
    setFeedUser('')
    setFeedPassword('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      if (tab === 'feed') {
        if (!url.trim()) throw new Error('Enter a feed URL')
        await createFeed(
          settings,
          url.trim(),
          folderId,
          useFeedAuth ? { user: feedUser, password: feedPassword } : undefined,
        )
        clearFeedAuth()
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
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      className="fixed left-1/2 top-1/2 z-[1001] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-app-border bg-app-panel p-5"
    >
      <div className="mb-3 flex items-center justify-between uppercase tracking-[0.06em]">
        <span id={titleId} className="text-app-muted">
          Add
        </span>
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
          disabled={busy}
        >
          Feed
        </button>
        <button
          className={`rounded-none border-0 px-2.5 py-1.5 text-sm ${tab === 'folder' ? 'bg-app-accent font-semibold text-app-on-accent' : 'bg-transparent text-app-muted'}`}
          onClick={() => {
            setTab('folder')
            clearFeedAuth()
          }}
          disabled={busy}
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
                ref={inputRef}
                data-dialog-autofocus
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                disabled={busy}
              />
            </label>
            <label className="field">
              Folder
              <select
                value={folderId ?? 0}
                onChange={(e) => setFolderId(Number(e.target.value) || null)}
                disabled={busy}
              >
                <option value={0}>No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useFeedAuth}
                disabled={busy || !canUseFeedAuth}
                aria-describedby={authHintId}
                onChange={(e) => {
                  if (e.target.checked) setUseFeedAuth(true)
                  else clearFeedAuth()
                }}
              />
              Use HTTP Basic Auth
            </label>
            <p id={authHintId} className="text-xs text-app-muted">
              {canUseFeedAuth
                ? 'Optional feed credentials, not your Nextcloud login. Nextcloud stores them to fetch this feed.'
                : 'Password-protected feeds require the app-root /apps proxy. This Nextcloud URL is unsupported; ordinary feeds can still be added.'}
            </p>
            {useFeedAuth && (
              <>
                <label className="field">
                  Feed username
                  <input
                    type="text"
                    value={feedUser}
                    onChange={(e) => setFeedUser(e.target.value)}
                    autoComplete="off"
                    required
                    disabled={busy}
                  />
                </label>
                <label className="field">
                  Feed password
                  <input
                    type="password"
                    value={feedPassword}
                    onChange={(e) => setFeedPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={busy}
                  />
                </label>
              </>
            )}
          </>
        ) : (
          <label className="field">
            Name
            <input
              ref={inputRef}
              data-dialog-autofocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My folder"
              disabled={busy}
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
    </Dialog>
  )
}
