import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { ContextMenu } from '@base-ui/react/context-menu'
import { IconExternalLink, IconCheck } from '@tabler/icons-react'
import type { NewsFeed, NewsFolder } from '../../api/types'
import type { Settings } from '../../settings'
import { deleteFeed, moveFeed, renameFeed } from '../../api/news'
import { markFeedAllRead } from '../../actions'
import { copyText } from '../../utils'

export interface FeedMenuOptions {
  folders: NewsFolder[]
  settings: Settings
  onChanged: () => void
  onOpenSettings: (feed: NewsFeed) => void
}

let latestOpening = 0

/** Compose the real row button: no nested interactive trigger or transient opener. */
export function FeedContextMenu({
  feed,
  menu,
  children,
}: {
  feed: NewsFeed
  menu: FeedMenuOptions
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [keyboardAnchor, setKeyboardAnchor] = useState<HTMLElement | null>(null)
  const handoff = useRef(false)
  useLayoutEffect(() => {
    if (!open) return
    const opening = ++latestOpening
    return () => {
      // Resolve after ancestor host removal, not during child layout cleanup:
      // a collapsing folder can still contain a soon-to-be-detached row here.
      queueMicrotask(() => {
        if (opening !== latestOpening || handoff.current) return
        const activeDialog = [...document.querySelectorAll<HTMLElement>('.app-dialog')].some(
          (dialog) => dialog.getClientRects().length > 0,
        )
        if (activeDialog) return
        const target =
          document.querySelector<HTMLElement>(`[data-feed-id="${feed.id}"]`) ??
          document.querySelector<HTMLElement>('[data-feed-focus-fallback]')
        if (target?.isConnected) target.focus()
      })
    }
  }, [open, feed.id])
  return (
    <ContextMenu.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          handoff.current = false
          setKeyboardAnchor(null)
        }
        setOpen(next)
      }}
    >
      <ContextMenu.Trigger
        render={children}
        onKeyDown={(event) => {
          if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
          event.preventDefault()
          event.stopPropagation()
          handoff.current = false
          setKeyboardAnchor(event.currentTarget)
          setOpen(true)
        }}
      />
      {open && (
        <ContextMenu.Portal>
          <ContextMenu.Backdrop className="ctx-backdrop" />
          <ContextMenu.Positioner
            anchor={keyboardAnchor ?? undefined}
            collisionPadding={8}
            className="z-[1002]"
          >
            <ContextMenu.Popup
              className="ctx-menu"
              aria-label={`Actions for ${feed.title}`}
              onContextMenu={(event) => {
                event.preventDefault()
                setOpen(false)
              }}
              finalFocus={false}
            >
              <FeedMenuItems
                feed={feed}
                {...menu}
                onClose={() => setOpen(false)}
                onOpenSettings={() => {
                  // Suppress the menu's delayed focus job before mounting the modal.
                  handoff.current = true
                  setOpen(false)
                  menu.onOpenSettings(feed)
                }}
              />
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      )}
    </ContextMenu.Root>
  )
}

function FeedMenuItems({
  feed,
  folders,
  settings,
  onClose,
  onChanged,
  onOpenSettings,
}: FeedMenuOptions & { feed: NewsFeed; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const locked = useRef(false)
  const alive = useRef(true)
  const copyTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      window.clearTimeout(copyTimer.current)
    }
  }, [])

  const mutate = async (write: () => Promise<unknown>) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError(null)
    try {
      await write()
      onChanged()
      if (alive.current) onClose()
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : String(e))
        setBusy(false)
        locked.current = false
      }
    }
  }
  const rename = () => {
    if (locked.current) return
    const name = prompt(`Rename feed "${feed.title}":`, feed.title)
    if (name === null || name.trim() === '' || name.trim() === feed.title) return
    void mutate(() => renameFeed(settings, feed.id, name.trim()))
  }
  const remove = () => {
    if (locked.current || !confirm(`Delete feed "${feed.title}" and its items?`)) return
    void mutate(() => deleteFeed(settings, feed.id))
  }
  const copy = async () => {
    if (locked.current || copied) return
    locked.current = true
    setBusy(true)
    setError(null)
    try {
      await copyText(feed.url)
      if (!alive.current) return
      setBusy(false)
      locked.current = false
      setCopied(true)
      // This instance owns both the acknowledgement and its dismissal. Neither
      // an old clipboard promise nor an old timer may close a reopened menu.
      copyTimer.current = window.setTimeout(() => {
        if (alive.current) onClose()
      }, 700)
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : 'could not copy')
        setBusy(false)
        locked.current = false
      }
    }
  }
  return (
    <>
      {feed.unreadCount > 0 && (
        <ContextMenu.Item
          className="ctx-item"
          disabled={busy}
          closeOnClick={false}
          onClick={() => void mutate(() => markFeedAllRead(settings, feed.id))}
        >
          Mark all as read
        </ContextMenu.Item>
      )}
      <ContextMenu.SubmenuRoot>
        <ContextMenu.SubmenuTrigger className="ctx-item" disabled={busy}>
          Move to folder…
        </ContextMenu.SubmenuTrigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner collisionPadding={8} className="z-[1003]">
            <ContextMenu.Popup
              className="ctx-menu"
              aria-label="Move to folder"
              onContextMenu={(event) => {
                event.preventDefault()
                onClose()
              }}
            >
              {[{ id: null, name: 'No folder' }, ...folders].map((folder) => (
                <ContextMenu.Item
                  key={folder.id ?? 'none'}
                  className="ctx-item"
                  disabled={busy}
                  closeOnClick={false}
                  onClick={() => void mutate(() => moveFeed(settings, feed.id, folder.id))}
                >
                  {folder.name}
                </ContextMenu.Item>
              ))}
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.SubmenuRoot>
      <ContextMenu.Item className="ctx-item" disabled={busy} closeOnClick={false} onClick={rename}>
        Rename
      </ContextMenu.Item>
      <ContextMenu.Item
        className="ctx-item"
        closeOnClick={false}
        onClick={() => onOpenSettings(feed)}
      >
        Feed settings…
      </ContextMenu.Item>
      <ContextMenu.Item
        className="ctx-item danger"
        disabled={busy}
        closeOnClick={false}
        onClick={remove}
      >
        Delete
      </ContextMenu.Item>
      {feed.link && (
        <ContextMenu.Item
          className="ctx-item"
          onClick={() => window.open(feed.link!, '_blank', 'noopener')}
        >
          Open website <IconExternalLink className="menu-icon" aria-hidden="true" />
        </ContextMenu.Item>
      )}
      <ContextMenu.Item
        className="ctx-item"
        disabled={busy || copied}
        closeOnClick={false}
        onClick={() => void copy()}
      >
        {copied ? (
          <>
            Copied <IconCheck className="menu-icon" aria-hidden="true" />
          </>
        ) : (
          'Copy feed url'
        )}
      </ContextMenu.Item>
      {error && (
        <div role="alert" className="error ctx-error">
          {error}
        </div>
      )}
      {busy && <div className="muted ctx-busy">Working…</div>}
    </>
  )
}
