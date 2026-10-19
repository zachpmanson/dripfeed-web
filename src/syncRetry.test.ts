import { describe, expect, it } from 'vitest'
import { ApiError } from './api/client'
import {
  createSyncRetryState,
  isNetworkError,
  recordSyncFailure,
  recordSyncSuccess,
  retryAfterOnline,
} from './syncRetry'

describe('isNetworkError', () => {
  it('recognizes fetch network failures', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('does not bypass server-error backoff', () => {
    expect(isNetworkError(new ApiError('rate limited', 429))).toBe(false)
    expect(isNetworkError(new Error('unexpected'))).toBe(false)
  })
})

describe('background sync retry lifecycle', () => {
  it('bypasses network backoff when connectivity returns', () => {
    const state = createSyncRetryState(1_000)
    recordSyncFailure(state, new TypeError('Failed to fetch'), 2_000)

    expect(state.nextSyncAt).toBe(62_000)
    expect(retryAfterOnline(state, 3_000)).toBe(true)
    expect(state.nextSyncAt).toBe(3_000)
    expect(retryAfterOnline(state, 4_000)).toBe(false)
    expect(state.failureBackoff).toBe(30_000)

    recordSyncFailure(state, new TypeError('Failed to fetch'), 5_000)
    expect(retryAfterOnline(state, 6_000)).toBe(true)
  })

  it('keeps server failures on backoff and resets after success', () => {
    const state = createSyncRetryState(1_000)
    recordSyncFailure(state, new ApiError('rate limited', 429), 2_000)

    expect(state.nextSyncAt).toBe(62_000)
    expect(retryAfterOnline(state, 3_000)).toBe(false)
    recordSyncSuccess(state)
    expect(state.failureBackoff).toBe(30_000)
    expect(state.retryOnOnline).toBe(false)
  })

  it('caps repeated failures at fifteen minutes', () => {
    const state = createSyncRetryState(0)
    for (let i = 0; i < 10; i++) {
      recordSyncFailure(state, new TypeError('Failed to fetch'), 1_000)
    }
    expect(state.failureBackoff).toBe(15 * 60_000)
    expect(state.nextSyncAt).toBe(901_000)
    expect(retryAfterOnline(state, 2_000)).toBe(true)
    expect(state.failureBackoff).toBe(30_000)
  })

  it('does not retain a stale network retry after success or a server failure', () => {
    const state = createSyncRetryState(0)
    recordSyncFailure(state, new TypeError('Failed to fetch'), 1_000)
    recordSyncSuccess(state)
    expect(retryAfterOnline(state, 2_000)).toBe(false)

    recordSyncFailure(state, new TypeError('Failed to fetch'), 3_000)
    recordSyncFailure(state, new ApiError('unavailable', 503), 4_000)
    expect(retryAfterOnline(state, 5_000)).toBe(false)
    expect(state.nextSyncAt).toBe(124_000)
  })
})
