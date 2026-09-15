/** Injected by vite.config.ts (define.__GIT_SHA__ / __BUILD_TIME__) at build time. */
declare const __GIT_SHA__: string
declare const __BUILD_TIME__: string

export const REPO_URL = 'https://github.com/zachpmanson/dripfeed-web'
export const GIT_SHA: string = typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'dev'
export const BUILD_TIME: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''

/**
 * Deploy label, e.g. "2026-09-14 @ d99fcd2" — ISO date first, then the short
 * sha, matching the penultimate-guitar footer. Falls back to the bare sha
 * when there's no usable build time (dev builds).
 */
export function deployLabel(): string {
  if (!BUILD_TIME) return GIT_SHA
  const t = new Date(BUILD_TIME)
  if (Number.isNaN(t.getTime())) return GIT_SHA
  return `${t.toISOString().slice(0, 10)} @ ${GIT_SHA}`
}
