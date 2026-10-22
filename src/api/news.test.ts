import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFeedFullText, fetchFeeds, fetchFulltext, setFeedFullText } from './news'
import type { Settings } from '../settings'

const settings = { baseUrl: '', user: 'remote-reader', appPassword: 'remote-secret' }
const rejectedBases = [
  'https://other-cloud.example',
  'https://other-cloud.example/nextcloud/',
  'http://reader.example',
  'https://reader.example:8443',
  'https://reader.example/nextcloud',
  'https://reader.example/nextcloud/',
  'https://reader.example/apps',
  'https://reader.example/?instance=other',
  'https://reader.example/#other',
  'not a URL',
  'https://nextcloud.zachmanson.com',
]
const supportedBases = ['', '  ', '/', 'https://reader.example', ' https://reader.example/// ']
const legacyOperations = [
  {
    name: 'article extraction',
    request: (s: Settings) => fetchFulltext(s, 123),
    path: '/apps/news/items/123/fulltext',
    method: undefined,
    response: '[{"id":123,"body":"Extracted"}]',
  },
  {
    name: 'full-text settings read',
    request: (s: Settings) => fetchFeedFullText(s),
    path: '/apps/news/feeds',
    method: undefined,
    response: '{"feeds":[{"id":456,"fullTextEnabled":true}]}',
  },
  {
    name: 'full-text settings write',
    request: (s: Settings) => setFeedFullText(s, 456, true),
    path: '/apps/news/feeds/456',
    method: 'PATCH',
    response: '[]',
  },
]

beforeEach(() => {
  vi.stubGlobal('location', new URL('https://reader.example/reader/'))
})
afterEach(() => vi.unstubAllGlobals())

describe.each(legacyOperations)('$name proxy boundary', ({ request, path, method, response }) => {
  it.each(rejectedBases)('rejects %s without a request or auth construction', async (baseUrl) => {
    const fetchMock = vi.fn<typeof fetch>()
    const authMock = vi.fn<typeof btoa>()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('btoa', authMock)

    await expect(request({ ...settings, baseUrl })).rejects.toThrow(
      /unsupported.*app-root \/apps proxy.*Regular News API features remain available/,
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(authMock).not.toHaveBeenCalled()
  })

  it.each(supportedBases)('uses the relative proxy route for %j', async (baseUrl) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(response))
    vi.stubGlobal('fetch', fetchMock)

    const result = await request({ ...settings, baseUrl })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe(path)
    const init = fetchMock.mock.calls[0][1]!
    expect(init.method).toBe(method)
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe(`Basic ${btoa('remote-reader:remote-secret')}`)
    expect(headers.get('OCS-APIREQUEST')).toBe('true')
    expect(headers.get('Accept')).toBe('application/json')
    if (method === 'PATCH') {
      expect(init.body).toBe('{"fullTextEnabled":true}')
      expect(headers.get('Content-Type')).toBe('application/json')
    } else if (path.endsWith('/fulltext')) {
      expect(result).toEqual({ id: 123, body: 'Extracted' })
    } else {
      expect(result).toEqual(new Map([[456, true]]))
    }
  })
})

it.each([
  'https://other-cloud.example',
  'https://other-cloud.example/nextcloud/',
  'https://reader.example/nextcloud/',
])('preserves ordinary configured-instance v1-3 requests to %s', async (baseUrl) => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"feeds":[]}'))
  vi.stubGlobal('fetch', fetchMock)

  await expect(fetchFeeds({ ...settings, baseUrl })).resolves.toEqual({ feeds: [] })

  expect(fetchMock).toHaveBeenCalledOnce()
  expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl.replace(/\/+$/, '')}/apps/news/api/v1-3/feeds`)
  const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
  expect(headers.get('Authorization')).toBe(`Basic ${btoa('remote-reader:remote-secret')}`)
})

describe.each(legacyOperations)('$name production proxy alias', ({ request, path, response }) => {
  it.each(['https://nextcloud.zachmanson.com', ' https://nextcloud.zachmanson.com/// '])(
    'routes a saved production URL %j through the same-origin proxy',
    async (baseUrl) => {
      vi.stubGlobal('location', new URL('https://dripfeed.zachmanson.com/'))
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(response))
      vi.stubGlobal('fetch', fetchMock)

      await request({ ...settings, baseUrl })

      expect(fetchMock).toHaveBeenCalledOnce()
      expect(fetchMock.mock.calls[0][0]).toBe(path)
      expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
        `Basic ${btoa('remote-reader:remote-secret')}`,
      )
    },
  )

  it.each([
    'https://nextcloud.zachmanson.com/nextcloud',
    'https://nextcloud.zachmanson.com/?instance=other',
    'https://nextcloud.zachmanson.com/#other',
    'https://user:pass@nextcloud.zachmanson.com',
    'https://nextcloud.zachmanson.com:8443',
    'http://nextcloud.zachmanson.com',
    'https://nextcloud.zachmanson.com.evil.example',
    'https://other-cloud.example',
  ])('does not alias a different instance %s on production', async (baseUrl) => {
    vi.stubGlobal('location', new URL('https://dripfeed.zachmanson.com/'))
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(request({ ...settings, baseUrl })).rejects.toThrow('unsupported')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

it('uses the same production proxy for versioned API requests from saved logins', async () => {
  vi.stubGlobal('location', new URL('https://dripfeed.zachmanson.com/'))
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"feeds":[]}'))
  vi.stubGlobal('fetch', fetchMock)

  await fetchFeeds({ ...settings, baseUrl: 'https://nextcloud.zachmanson.com' })

  expect(fetchMock.mock.calls[0][0]).toBe('/apps/news/api/v1-3/feeds')
})

it.each(['https://other-cloud.example', 'https://nextcloud.zachmanson.com/nextcloud'])(
  'does not redirect versioned requests for %s to the production proxy',
  async (baseUrl) => {
    vi.stubGlobal('location', new URL('https://dripfeed.zachmanson.com/'))
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"feeds":[]}'))
    vi.stubGlobal('fetch', fetchMock)

    await fetchFeeds({ ...settings, baseUrl })

    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/apps/news/api/v1-3/feeds`)
  },
)

it('rejects unsupported settings before even validating credentials', async () => {
  const fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)

  await expect(
    setFeedFullText({ ...settings, baseUrl: rejectedBases[0], user: 'invalid:user' }, 456, true),
  ).rejects.toThrow('unsupported')
  expect(fetchMock).not.toHaveBeenCalled()
})
