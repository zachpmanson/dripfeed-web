/** Floor between background sync attempts, including wake events. */
export const WAKE_THROTTLE_MS = 30_000
const MAX_BACKOFF_MS = 15 * 60_000

export interface SyncRetryState {
  failureBackoff: number
  retryOnOnline: boolean
  nextSyncAt: number
}

export function createSyncRetryState(now: number): SyncRetryState {
  return {
    failureBackoff: WAKE_THROTTLE_MS,
    retryOnOnline: false,
    nextSyncAt: now + WAKE_THROTTLE_MS,
  }
}

/** Network fetch failures are TypeErrors; server/API errors must honor backoff. */
export function isNetworkError(error: unknown): error is TypeError {
  return error instanceof TypeError
}

export function recordSyncFailure(state: SyncRetryState, error: unknown, now: number): void {
  state.retryOnOnline = isNetworkError(error)
  state.failureBackoff = Math.min(state.failureBackoff * 2, MAX_BACKOFF_MS)
  state.nextSyncAt = now + state.failureBackoff
}

export function recordSyncSuccess(state: SyncRetryState): void {
  state.failureBackoff = WAKE_THROTTLE_MS
  state.retryOnOnline = false
}

/** Returns true only when an online event should bypass the current backoff. */
export function retryAfterOnline(state: SyncRetryState, now: number): boolean {
  if (!state.retryOnOnline) return false
  state.retryOnOnline = false
  state.failureBackoff = WAKE_THROTTLE_MS
  state.nextSyncAt = now
  return true
}
