import { useRef, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { useModalLayer } from './useModalLayer'

/** Candidate for Settings only; the other consumers retain native modality. */
export function BaseDialog({
  labelledBy,
  onClose,
  className = 'modal',
  restoreFocusTo,
  children,
}: {
  labelledBy: string
  onClose: () => void
  className?: string
  restoreFocusTo?: string
  children: ReactNode
}) {
  const popup = useRef<HTMLDivElement>(null)
  const layer = useModalLayer(popup, restoreFocusTo)
  return (
    <Dialog.Root
      open={layer.active}
      onOpenChange={(open, details) => {
        if (!layer.isTop()) details.cancel()
        else if (!open) onClose()
      }}
    >
      <Dialog.Portal keepMounted>
        <Dialog.Backdrop className="base-dialog-backdrop fixed inset-0 z-[1000] bg-[var(--scrim)]" />
        <Dialog.Popup
          ref={popup}
          className={`app-dialog ${className}`}
          aria-labelledby={labelledBy}
          // Resume the current field after suspension; otherwise match native focus.
          initialFocus={() => layer.initialFocus() ?? true}
          // The shared owner stack restores focus; the library must not restore
          // behind a newer native dialog when this popup is merely suspended.
          finalFocus={false}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
