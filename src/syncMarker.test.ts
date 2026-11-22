import { afterEach, describe, expect, it, vi } from 'vitest'
import { markerStamp, nextReconcileMarker, RECONCILE_MARKER_KEY } from './syncMarker'

afterEach(() => vi.restoreAllMocks())

describe('reconcile sync marker', () => {
  it('seeds from the server timestamp with a two-second safety overlap', () => {
    expect(markerStamp(100)).toBe(98)
    expect(markerStamp(1)).toBe(0)
  })

  it('retains an existing marker without Date regardless of browser clock', () => {
    vi.spyOn(Date, 'now').mockReturnValue(9_000_000_000_000)
    expect(nextReconcileMarker(90, null)).toBe(90)
    expect(nextReconcileMarker(0, null)).toBe(0)
  })

  it('advances only from Date and retains a valid marker within the overlap', () => {
    expect(nextReconcileMarker(90, 100)).toBe(98)
    expect(nextReconcileMarker(99, 100)).toBe(99)
    expect(nextReconcileMarker(100, 100)).toBe(100)
  })

  it('uses the canonical database metadata key', () => {
    expect(RECONCILE_MARKER_KEY).toBe('reconcile:lastModified')
  })
})
