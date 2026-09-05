import type { Settings } from '../settings'

const NEWS_API_PREFIX = '/apps/news/api/v1-3'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export function apiUrl(settings: Settings, path: string, prefixed = true): string {
  // Empty baseUrl = same origin (deployed behind the caddy /apps proxy).
  const base = settings.baseUrl.trim().replace(/\/+$/, '')
  return `${base}${prefixed ? NEWS_API_PREFIX : ''}${path}`
}

async function authedFetch(
  settings: Settings,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = btoa(
    `${encodeURIComponent(settings.user)}:${encodeURIComponent(settings.appPassword)}`,
  )
  headers.set('Authorization', `Basic ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401) {
    throw new ApiError('Not authorized — check your username and app password', 401)
  }
  if (!res.ok) {
    throw new ApiError(`Server error ${res.status} on ${url}`, res.status)
  }
  return res
}

export async function apiFetch(
  settings: Settings,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return authedFetch(settings, apiUrl(settings, path), init)
}

/**
 * Fetch a route OUTSIDE the /api/v1-3 prefix — the legacy scraper
 * endpoints (e.g. /apps/news/items/{id}/fulltext) live at the app root,
 * not under the versioned API.
 */
export async function apiFetchRaw(
  settings: Settings,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return authedFetch(settings, apiUrl(settings, path, false), init)
}

export async function apiGet<T>(settings: Settings, path: string): Promise<T> {
  const res = await apiFetch(settings, path)
  return (await res.json()) as T
}

/** POST, optionally with a JSON body (returns parsed JSON when present). */
export async function apiPost<T = void>(
  settings: Settings,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await apiFetch(settings, path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/** DELETE with no body. */
export async function apiDelete(settings: Settings, path: string): Promise<void> {
  await apiFetch(settings, path, { method: 'DELETE' })
}