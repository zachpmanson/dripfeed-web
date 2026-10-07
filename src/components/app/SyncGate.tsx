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
    <div className="sync-gate">
      <div className="sync-card">
        <h1>Dripfeed</h1>
        {error ? (
          <div className="error">{error}</div>
        ) : progress ? (
          <>
            <p className="muted">syncing… {progress.done.toLocaleString()} items</p>
            <div className="progress indeterminate">
              <div className="progress-bar" />
            </div>
          </>
        ) : (
          <p className="muted spinner-row">
            <Spinner />
            connecting…
          </p>
        )}
        <button onClick={onStartOver}>start over</button>
      </div>
    </div>
  )
}
