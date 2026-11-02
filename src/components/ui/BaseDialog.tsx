import { useRef, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'

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
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="base-dialog-backdrop fixed inset-0 z-[1000] bg-[var(--scrim)]" />
        <Dialog.Popup
          ref={popup}
          className={`app-dialog ${className}`}
          aria-labelledby={labelledBy}
          // Native Settings focuses its close button even after pointer/touch opening.
          initialFocus={() =>
            popup.current?.querySelector<HTMLElement>(
              '[data-dialog-autofocus], button:not(:disabled)',
            ) ?? true
          }
          // Resolve a persistent target at close time, never a stale menu item ref.
          finalFocus={() =>
            (restoreFocusTo ? document.querySelector<HTMLElement>(restoreFocusTo) : null) ?? true
          }
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
