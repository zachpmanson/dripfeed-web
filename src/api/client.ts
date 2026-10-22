import type { Settings } from '../settings'

const NEWS_API_PREFIX = '/apps/news/api/v1-3'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class RateLimitCooldown {
  private readonly cooldowns = new Map<string, number>()

  remaining(key: string, now = Date.now()): number {
    const until = this.cooldowns.get(key) ?? 0
    if (until <= now) {
      this.cooldowns.delete(key)
      return 0
    }
    return until - now
  }

  extend(key: string, delay: number, now = Date.now()): number {
    const until = Math.max(this.cooldowns.get(key) ?? 0, now + delay)
    this.cooldowns.set(key, until)
    return until - now
  }
}

const rateLimitCooldown = new RateLimitCooldown()

function rateLimitKey(url: string): string {
  return new URL(url, globalThis.location?.href ?? 'http://same-origin.invalid').origin
}

function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined
}

function rateLimitMessage(delay?: number): string {
  if (delay === undefined)
    return 'The server is rate-limiting requests. Please wait before trying again.'
  const seconds = Math.ceil(delay / 1000)
  return `The server is rate-limiting requests. Try again in ${seconds}s.`
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof TypeError)
    return 'Could not reach the server. Check your connection and try again.'
  return error instanceof Error ? error.message : String(error)
}

export function isAuthError(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 401
}

/** Resolve the one known production backend to its same-origin proxy.
 * Keep this tied to BOTH origins: another deployment may proxy a different
 * instance, and a subpath on this host may identify a different Nextcloud.
 * Resolve at request time so existing saved logins need no migration.
 */
function apiBase(settings: Settings): string {
  const base = settings.baseUrl.trim().replace(/\/+$/, '')
  if (globalThis.location?.origin === 'https://dripfeed.zachmanson.com' && base) {
    try {
      const url = new URL(base)
      if (
        url.origin === 'https://nextcloud.zachmanson.com' &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
      ) {
        return ''
      }
    } catch {
      // Leave invalid URLs to the normal API validation/error path.
    }
  }
  return base
}

export function apiUrl(settings: Settings, path: string): string {
  // Empty baseUrl = same origin (deployed behind the caddy /apps proxy).
  return `${apiBase(settings)}${NEWS_API_PREFIX}${path}`
}

async function authedFetch(
  settings: Settings,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  // Basic auth uses the first colon as the separator, so usernames cannot contain it.
  if (settings.user.includes(':')) {
    throw new Error('Username cannot contain a colon for Basic authentication')
  }
  const headers = new Headers(init.headers)
  const bytes = new TextEncoder().encode(`${settings.user}:${settings.appPassword}`)
  const token = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
  headers.set('Authorization', `Basic ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const cooldownKey = rateLimitKey(url)
  const remainingCooldown = rateLimitCooldown.remaining(cooldownKey)
  if (remainingCooldown > 0) {
    throw new ApiError(rateLimitMessage(remainingCooldown), 429, remainingCooldown)
  }

  const res = await fetch(url, { ...init, headers })

  if (res.status === 401) {
    throw new ApiError('Not authorized — check your username and app password', 401)
  }
  if (!res.ok) {
    if (res.status === 429) {
      const retryAfterMs = parseRetryAfter(res.headers.get('Retry-After')) ?? 60_000
      rateLimitCooldown.extend(cooldownKey, retryAfterMs)
      throw new ApiError(rateLimitMessage(retryAfterMs), 429, retryAfterMs)
    }
    const message =
      res.status >= 500
        ? 'The server is having trouble. Your changes were not synced; please try again later.'
        : `Request failed (${res.status}). Please try again.`
    throw new ApiError(message, res.status)
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
 * Legacy News routes have no CORS/CSRF exemption and use the app's /apps
 * proxy. An empty base URL, this origin's root, or the exact known production
 * backend maps to that proxy; never send another instance's credentials or
 * IDs to these relative routes.
 * Callers still need OCS-APIREQUEST for Nextcloud's CSRF check.
 */
export async function apiFetchSameOrigin(
  settings: Settings,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = apiBase(settings)
  if (base) {
    let matchesProxy = false
    try {
      const url = new URL(base)
      matchesProxy =
        url.origin === globalThis.location?.origin &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password
    } catch {
      // Invalid base URLs cannot establish that this is the proxied instance.
    }
    if (!matchesProxy) {
      throw new Error(
        'Full-article extraction and per-feed full-text settings are unsupported for this Nextcloud URL. Use the app-root /apps proxy with a blank URL or this app’s origin (no Nextcloud subpath). Regular News API features remain available.',
      )
    }
  }
  return authedFetch(settings, path, init)
}

export async function apiGet<T>(settings: Settings, path: string): Promise<T> {
  const res = await apiFetch(settings, path)
  return (await res.json()) as T
}

/**
 * GET whose response headers matter as much as the body. The reconcile
 * marker needs the server's own wall clock (`Date`), and that is only
 * readable from the response object. `Date` is NOT a CORS-safelisted response
 * header: cross-origin servers must expose it via Access-Control-Expose-Headers,
 * otherwise callers see it as missing and must keep a conservative marker.
 */
export async function apiGetWithHeaders<T>(
  settings: Settings,
  path: string,
): Promise<{ data: T; headers: Headers }> {
  const res = await apiFetch(settings, path)
  return { data: (await res.json()) as T, headers: res.headers }
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
