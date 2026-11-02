import { useId } from 'react'
import { Toast } from '@base-ui/react/toast'

export default function ErrorToast({
  error,
  onDismiss,
}: {
  error: string | null
  onDismiss: () => void
}) {
  const id = useId()
  if (!error) return null

  // The app owns the error/session/dedup lifecycle. A controlled ToastObject
  // presents that state without copying it into a second notification store.
  return (
    <Toast.Provider timeout={0}>
      <Toast.Root
        toast={{ id, description: error, timeout: 0 }}
        swipeDirection={[]}
        role="alert"
        aria-atomic="true"
        tabIndex={-1}
        onKeyDown={(event) => {
          // Only the explicit dismiss control clears the externally owned error.
          if (event.key === 'Escape') event.preventBaseUIHandler()
        }}
        className="fixed right-3 bottom-3 left-3 z-40 flex items-start gap-3 rounded-lg border border-app-danger bg-app-panel p-3 text-sm text-app-text shadow-lg sm:left-auto sm:w-96"
      >
        <Toast.Description
          render={<span />}
          className="max-h-[50dvh] min-w-0 flex-1 overflow-y-auto text-app-danger [overflow-wrap:anywhere]"
        />
        <button
          type="button"
          className="min-h-9 shrink-0 rounded px-2 py-1 text-app-text hover:bg-app-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
          aria-label="Dismiss error"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </Toast.Root>
    </Toast.Provider>
  )
}
