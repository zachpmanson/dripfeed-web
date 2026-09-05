export interface Settings {
  baseUrl: string // e.g. https://nextcloud.zachmanson.com
  user: string
  appPassword: string
}

const KEY = 'dripfeed.settings'

export function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Settings
    // sanity: user + password present; baseUrl empty = same origin (prod
    // caddy proxy), otherwise it must look like a URL
    if (!s.user || !s.appPassword) return null
    const base = s.baseUrl ?? ''
    if (base !== '' && !/^https?:\/\//.test(base)) return null
    return s
  } catch {
    return null
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function clearSettings(): void {
  localStorage.removeItem(KEY)
}