import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModalLayer } from './useModalLayer'

/** Native modality keeps the app (including article iframes) inert, without
 * changing its DOM or styles. Mount only while open; unmount restores focus. */
export function Dialog({
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
  const ref = useRef<HTMLDialogElement>(null)
  const backdropPress = useRef(false)

  const layer = useModalLayer(ref, restoreFocusTo, {
    activate: () => {
      const dialog = ref.current!
      if (!dialog.open) dialog.showModal()
      layer.initialFocus()?.focus()
    },
    suspend: () => {
      backdropPress.current = false
      ref.current?.close()
    },
  })

  const outside = (x: number, y: number) => {
    const rect = ref.current!.getBoundingClientRect()
    return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom
  }

  return createPortal(
    <dialog
      ref={ref}
      className={`app-dialog ${className}`}
      aria-labelledby={labelledBy}
      aria-modal="true"
      onCancel={(event) => {
        // React owns the open state; don't let Escape leave a mounted, closed dialog.
        event.preventDefault()
        if (layer.isTop()) onClose()
      }}
      onPointerDown={(event) => {
        backdropPress.current =
          event.target === event.currentTarget && outside(event.clientX, event.clientY)
      }}
      onClick={(event) => {
        if (
          backdropPress.current &&
          event.target === event.currentTarget &&
          outside(event.clientX, event.clientY)
        )
          onClose()
        backdropPress.current = false
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        // Wrap at the edges rather than letting the browser move to its chrome.
        // Re-query each time: controls can disappear or become disabled while busy.
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, textarea, [tabindex]',
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled') &&
            element.getClientRects().length > 0,
        )
        const first = controls[0]
        const last = controls.at(-1)
        if (!first) {
          event.preventDefault()
          return
        }
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === event.currentTarget)
        ) {
          event.preventDefault()
          last!.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }}
    >
      {children}
    </dialog>,
    document.body,
  )
}
