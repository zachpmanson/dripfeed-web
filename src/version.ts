/** Injected by vite.config.ts (define.__GIT_SHA__ / __BUILD_TIME__) at build time. */
declare const __GIT_SHA__: string
declare const __BUILD_TIME__: string

export const REPO_URL = 'https://github.com/zachpmanson/dripfeed-web'
export const GIT_SHA: string = typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : 'dev'
export const BUILD_TIME: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''
