import { describe, expect, it } from 'vitest'
import { markerStamp, nextReconcileMarker, RECONCILE_MARKER_KEY } from './syncMarker'

describe('reconcile sync marker', () => {
  it('uses the server timestamp with a two-second safety overlap', () => {
    expect(markerStamp(100)).toBe(98)
  })

  it('falls back to the supplied local time only without a server timestamp', () => {
    expect(markerStamp(null, 123)).toBe(123)
  })

  it('advances to the newest returned item and never moves backwards', () => {
    expect(nextReconcileMarker(90, 100, [96, 101, 99])).toBe(101)
    expect(nextReconcileMarker(99, 100, [96, 97])).toBe(99)
  })

  it('uses the canonical database metadata key', () => {
    expect(RECONCILE_MARKER_KEY).toBe('reconcile:lastModified')
  })
})
