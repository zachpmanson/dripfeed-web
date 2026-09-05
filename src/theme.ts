export type ThemeSetting = 'light' | 'dark' | 'system'

const UI_KEY = 'dripfeed.uiTheme'
const ARTICLE_KEY = 'dripfeed.articleTheme'

export function loadThemeSetting(key: string): ThemeSetting {
  try {
    const v = localStorage.getItem(key)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

export function saveThemeSetting(key: string, v: ThemeSetting): void {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* ignore */
  }
}

export const uiThemeKey = UI_KEY
export const articleThemeKey = ARTICLE_KEY

const FAVICONS_KEY = 'dripfeed.showFavicons'

export function loadShowFavicons(): boolean {
  try {
    return localStorage.getItem(FAVICONS_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveShowFavicons(v: boolean): void {
  try {
    localStorage.setItem(FAVICONS_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Resolve a light/dark/system setting against the OS preference. */
export function effectiveTheme(setting: ThemeSetting): 'light' | 'dark' {
  if (setting !== 'system') return setting
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Apply the resolved UI theme to <html data-theme>. */
export function applyUiTheme(setting: ThemeSetting): void {
  const eff = effectiveTheme(setting)
  document.documentElement.dataset.theme = eff
  document.documentElement.style.colorScheme = eff
}