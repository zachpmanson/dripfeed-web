import { Spinner } from '../ui/Spinner'

export default function SyncGate({
  error,
  progress,
  onStartOver,
}: {
  error: string | null
  progress: { done: number } | null
  onStartOver: () => void
}) {
  return (
    <div className="sync-gate flex min-h-full items-center justify-center">
      <div className="sync-card w-[min(28rem,calc(100%-2rem))] rounded-lg border border-[var(--border)] bg-[var(--panel)] p-6">
        <h1>Dripfeed</h1>
        {error ? (
          <div className="error">{error}</div>
        ) : progress ? (
          <>
            <p className="muted text-[var(--muted)]">
              syncing… {progress.done.toLocaleString()} items
            </p>
            <div className="progress indeterminate">
              <div className="progress-bar" />
            </div>
          </>
        ) : (
          <p className="muted spinner-row flex items-center gap-2 text-[var(--muted)]">
            <Spinner />
            connecting…
          </p>
        )}
        <button onClick={onStartOver}>start over</button>
      </div>
    </div>
  )
}
