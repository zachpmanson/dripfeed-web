const MARKER_SAFETY_SECONDS = 2

/** Meta key holding the last safely reconciled server modification time. */
export const RECONCILE_MARKER_KEY = 'reconcile:lastModified'

/**
 * Stamp a delta request using the server clock, backing off to safely re-fetch
 * changes that could land between the delta query and its response timestamp.
 */
export function markerStamp(
  serverTime: number | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): number {
  return serverTime === null ? nowSeconds : serverTime - MARKER_SAFETY_SECONDS
}

/** Advance without moving backwards, including timestamps from returned rows. */
export function nextReconcileMarker(
  previous: number,
  serverTime: number | null,
  itemLastModified: Iterable<number>,
): number {
  let marker = markerStamp(serverTime)
  for (const modified of itemLastModified) {
    if (modified && modified > marker) marker = modified
  }
  return Math.max(previous, marker)
}
