export default function ErrorToast({
  error,
  onDismiss,
}: {
  error: string | null
  onDismiss: () => void
}) {
  if (!error) return null

  return (
    <div
      role="alert"
      aria-atomic="true"
      className="fixed right-3 bottom-3 left-3 z-40 flex items-start gap-3 rounded-lg border border-app-danger bg-app-panel p-3 text-sm text-app-text shadow-lg sm:left-auto sm:w-96"
    >
      <span className="max-h-[50dvh] min-w-0 flex-1 overflow-y-auto text-app-danger [overflow-wrap:anywhere]">
        {error}
      </span>
      <button
        type="button"
        className="min-h-9 shrink-0 rounded px-2 py-1 text-app-text hover:bg-app-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        aria-label="Dismiss error"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  )
}
