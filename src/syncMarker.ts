const MARKER_SAFETY_SECONDS = 2

/** Meta key holding the last safely reconciled server modification time. */
export const RECONCILE_MARKER_KEY = 'reconcile:lastModified'

/**
 * Seed from the server clock with an overlap for changes between the query
 * and response. Without a readable Date, start at zero: replaying history is
 * safer than skipping changes based on a browser clock or item timestamp.
 */
export function markerStamp(serverTime: number | null): number {
  return serverTime === null ? 0 : Math.max(0, serverTime - MARKER_SAFETY_SECONDS)
}

/**
 * Missing Date retains the marker (and re-fetches the same overlap). Only a
 * server Date can advance it; returned item timestamps are not a safe clock.
 * A marker ahead of Date is poisoned or the server clock moved backwards:
 * reset to zero so the NEXT poll replays skipped history before advancing.
 * This can be a large replay, but resetting only to Date would lose old gaps.
 */
export function nextReconcileMarker(previous: number, serverTime: number | null): number {
  if (serverTime === null) return previous
  if (previous > serverTime) return 0
  return Math.max(previous, markerStamp(serverTime))
}
