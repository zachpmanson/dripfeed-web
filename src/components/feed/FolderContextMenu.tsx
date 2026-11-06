import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { ContextMenu } from '@base-ui/react/context-menu'
import type { NewsFolder } from '../../api/types'
import type { Settings } from '../../settings'
import { renameFolder } from '../../api/news'

export function FolderContextMenu({
  folder,
  settings,
  onChanged,
  onAddFeed,
  children,
}: {
  folder: NewsFolder
  settings: Settings
  onChanged: () => void
  onAddFeed: () => void
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [keyboardAnchor, setKeyboardAnchor] = useState<HTMLElement | null>(null)
  const handoff = useRef(false)
  useLayoutEffect(() => {
    if (!open) return
    return () => {
      queueMicrotask(() => {
        if (handoff.current || document.querySelector('[role="menu"], .app-dialog')) return
        const target =
          document.querySelector<HTMLElement>(`[data-folder-id="${folder.id}"]`) ??
          document.querySelector<HTMLElement>('[data-feed-focus-fallback]')
        target?.focus()
      })
    }
  }, [open, folder.id])

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
              aria-label={`Actions for folder ${folder.name}`}
              finalFocus={false}
              onContextMenu={(event) => {
                event.preventDefault()
                setOpen(false)
              }}
            >
              <FolderMenuItems
                folder={folder}
                settings={settings}
                onChanged={onChanged}
                onClose={() => setOpen(false)}
                onAddFeed={() => {
                  // The Add modal owns initial focus and restoration to this folder.
                  handoff.current = true
                  setOpen(false)
                  onAddFeed()
                }}
              />
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      )}
    </ContextMenu.Root>
  )
}

function FolderMenuItems({
  folder,
  settings,
  onChanged,
  onClose,
  onAddFeed,
}: {
  folder: NewsFolder
  settings: Settings
  onChanged: () => void
  onClose: () => void
  onAddFeed: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const rename = async () => {
    if (locked.current) return
    const name = prompt(`Rename folder "${folder.name}":`, folder.name)?.trim()
    if (!name || name === folder.name) return
    locked.current = true
    setBusy(true)
    setError(null)
    try {
      await renameFolder(settings, folder.id, name)
      onChanged()
      if (alive.current) onClose()
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : String(e))
        locked.current = false
        setBusy(false)
      }
    }
  }

  return (
    <>
      <ContextMenu.Item
        className="ctx-item"
        disabled={busy}
        closeOnClick={false}
        onClick={() => void rename()}
      >
        Rename
      </ContextMenu.Item>
      <ContextMenu.Item
        className="ctx-item"
        disabled={busy}
        closeOnClick={false}
        onClick={onAddFeed}
      >
        Add feed…
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
