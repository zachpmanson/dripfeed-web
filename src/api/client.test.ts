import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, apiFetchSameOrigin, RateLimitCooldown } from './client'

const settings = { baseUrl: 'https://cloud.example', user: 'reader', appPassword: 'password' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each([
  { name: 'apiFetch', request: apiFetch },
  { name: 'apiFetchSameOrigin', request: apiFetchSameOrigin },
])('$name Basic authentication', ({ request }) => {
  it.each([
    { user: 'reader@example.com+/%', appPassword: ' p@ss+word/%:with:colons ' },
    { user: '读者é😀', appPassword: '密碼🔑:café+/%@' },
  ])('encodes literal UTF-8 credentials for $user', async ({ user, appPassword }) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await request({ ...settings, user, appPassword }, '/items')

    expect(fetchMock).toHaveBeenCalledOnce()
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    const authorization = headers.get('Authorization')!
    expect(authorization).toMatch(/^Basic /)
    const bytes = Uint8Array.from(atob(authorization.slice(6)), (character) =>
      character.charCodeAt(0),
    )
    expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toBe(`${user}:${appPassword}`)
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('preserves caller headers and content type without mutating them', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const callerHeaders = new Headers({
      'OCS-APIREQUEST': 'true',
      'Content-Type': 'text/plain',
      Authorization: 'old token',
    })

    await request(settings, '/items', { method: 'POST', body: 'payload', headers: callerHeaders })

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get('OCS-APIREQUEST')).toBe('true')
    expect(headers.get('Content-Type')).toBe('text/plain')
    expect(headers.get('Authorization')).toBe(`Basic ${btoa('reader:password')}`)
    expect(callerHeaders.get('Authorization')).toBe('old token')
  })

  it('keeps caller headers when adding the default JSON content type', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await request(settings, '/items', {
      method: 'POST',
      body: '{}',
      headers: { 'OCS-APIREQUEST': 'true' },
    })

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get('OCS-APIREQUEST')).toBe('true')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('rejects a colon in the username before sending a request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(request({ ...settings, user: 'reader:name' }, '/items')).rejects.toThrow(
      'Username cannot contain a colon for Basic authentication',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('RateLimitCooldown', () => {
  it('keeps cooldowns isolated by origin', () => {
    const cooldown = new RateLimitCooldown()

    cooldown.extend('https://one.example', 60_000, 1_000)

    expect(cooldown.remaining('https://one.example', 2_000)).toBe(59_000)
    expect(cooldown.remaining('https://two.example', 2_000)).toBe(0)
  })

  it('extends a cooldown without shortening an existing one', () => {
    const cooldown = new RateLimitCooldown()

    cooldown.extend('https://one.example', 60_000, 1_000)
    cooldown.extend('https://one.example', 10_000, 2_000)

    expect(cooldown.remaining('https://one.example', 2_000)).toBe(59_000)
  })

  it('clears expired cooldowns', () => {
    const cooldown = new RateLimitCooldown()

    cooldown.extend('https://one.example', 1_000, 1_000)

    expect(cooldown.remaining('https://one.example', 2_000)).toBe(0)
    expect(cooldown.remaining('https://one.example', 1_000)).toBe(0)
  })
})
