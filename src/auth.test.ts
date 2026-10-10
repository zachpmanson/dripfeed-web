import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAuthFailure } from './actions'
import { apiFetch } from './api/client'
import type { Settings } from './settings'

const settings = {
  baseUrl: '',
  user: 'reader',
  appPassword: 'secret',
} as Settings

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authentication failure handling', () => {
  it('treats HTTP 401 as an authentication failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))

    const error = await apiFetch(settings, '/feeds').catch((e: unknown) => e)

    expect(isAuthFailure(error)).toBe(true)
  })

  it('does not treat HTTP 429 as an authentication failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 429 })))

    const error = await apiFetch(settings, '/feeds').catch((e: unknown) => e)

    expect(isAuthFailure(error)).toBe(false)
  })
})
