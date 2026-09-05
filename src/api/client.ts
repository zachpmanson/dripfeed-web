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

export function apiUrl(settings: Settings, path: string): string {
  // Normalize: strip trailing slash so concatenation is predictable.
  const base = settings.baseUrl.replace(/\/+$/, '')
  return `${base}${NEWS_API_PREFIX}${path}`
}

export async function apiFetch(
  settings: Settings,
  path: string,
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

  const res = await fetch(apiUrl(settings, path), { ...init, headers })

  if (res.status === 401) {
    throw new ApiError('Not authorized — check your username and app password', 401)
  }
  if (!res.ok) {
    throw new ApiError(`Server error ${res.status} on ${path}`, res.status)
  }
  return res
}

export async function apiGet<T>(settings: Settings, path: string): Promise<T> {
  const res = await apiFetch(settings, path)
  return (await res.json()) as T
}

/** POST with no body (state mutation endpoints like read/star). */
export async function apiPost(settings: Settings, path: string): Promise<void> {
  await apiFetch(settings, path, { method: 'POST' })
}