import { generate, ident, parse, tokenize, tokenTypes as tokens, walk } from 'css-tree'

export type ThemeSetting = 'light' | 'dark' | 'system'

const UI_KEY = 'dripfeed.uiTheme'
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

// Positive lists deliberately exclude resource functions, substitution (var/env),
// and future syntax until its resource behavior has been reviewed.
const articleCssFunctions = new Set([
  'calc',
  'min',
  'max',
  'clamp',
  'round',
  'mod',
  'rem',
  'abs',
  'sign',
  'pow',
  'sqrt',
  'hypot',
  'log',
  'exp',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
  'light-dark',
])
const articleCssPseudoFunctions = new Set([
  'is',
  'where',
  'not',
  'has',
  'lang',
  'dir',
  'nth-child',
  'nth-last-child',
  'nth-of-type',
  'nth-last-of-type',
])
const articleCssNodes = new Set([
  'StyleSheet',
  'Rule',
  'SelectorList',
  'Selector',
  'TypeSelector',
  'IdSelector',
  'ClassSelector',
  'AttributeSelector',
  'Combinator',
  'PseudoClassSelector',
  'PseudoElementSelector',
  'Nth',
  'AnPlusB',
  'Block',
  'Declaration',
  'Value',
  'Identifier',
  'String',
  'Number',
  'Dimension',
  'Percentage',
  'Hash',
  'Operator',
  'Function',
  'Parentheses',
  'Brackets',
  'WhiteSpace',
  'Atrule',
  'AtrulePrelude',
  'MediaQueryList',
  'MediaQuery',
  'Condition',
  'Feature',
  'FeatureRange',
  'Ratio',
  'SupportsDeclaration',
])

/**
 * A resource-free custom CSS subset, not arbitrary CSS. Reject the whole sheet
 * on unsupported syntax; never remove fragments and reassemble unsafe tokens.
 * Stored preferences are untouched. The output is also safe for HTML <style>
 * raw text, which is parsed before CSS (even inside CSS comments/strings).
 */
export function sanitizeArticleCss(css: string): string {
  // eslint-disable-next-line no-control-regex -- Refuse CSS preprocessing of control characters.
  if (/[<\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(css)) return ''
  try {
    // CSS parsing recovers from EOF inside blocks/strings/comments. Refuse that
    // recovery as well as reported parse errors, rather than repairing a sheet.
    const closing: number[] = []
    tokenize(css, (type, start, end) => {
      if (type === tokens.BadString || type === tokens.BadUrl) throw new Error('Bad token')
      if (type === tokens.Comment && (end - start < 4 || !css.slice(start, end).endsWith('*/')))
        throw new Error('Unclosed comment')
      if (type === tokens.String) {
        const text = css.slice(start, end)
        const trailingEscapes = text.slice(0, -1).match(/\\+$/)?.[0].length ?? 0
        if (text.length < 2 || text.at(-1) !== text[0] || trailingEscapes % 2)
          throw new Error('Unclosed string')
      }
      if (type === tokens.Function || type === tokens.LeftParenthesis)
        closing.push(tokens.RightParenthesis)
      else if (type === tokens.LeftSquareBracket) closing.push(tokens.RightSquareBracket)
      else if (type === tokens.LeftCurlyBracket) closing.push(tokens.RightCurlyBracket)
      else if (
        [tokens.RightParenthesis, tokens.RightSquareBracket, tokens.RightCurlyBracket].includes(
          type,
        ) &&
        closing.pop() !== type
      )
        throw new Error('Unbalanced CSS')
    })
    if (closing.length) return ''
    const ast = parse(css, {
      parseCustomProperty: true,
      onParseError() {
        throw new Error('Invalid CSS')
      },
    })
    walk(ast, (node) => {
      if (!articleCssNodes.has(node.type)) throw new Error('Unsupported node')
      if (
        node.type === 'Function' &&
        !articleCssFunctions.has(ident.decode(node.name).toLowerCase())
      )
        throw new Error('Unsupported function')
      if (
        (node.type === 'PseudoClassSelector' || node.type === 'PseudoElementSelector') &&
        node.children &&
        !articleCssPseudoFunctions.has(ident.decode(node.name).toLowerCase())
      )
        throw new Error('Unsupported pseudo function')
      if (
        node.type === 'Atrule' &&
        (!['media', 'supports'].includes(ident.decode(node.name).toLowerCase()) ||
          !node.prelude ||
          !node.block)
      )
        throw new Error('Unsupported at-rule')
      if (node.type === 'Declaration' && ident.decode(node.property).startsWith('--'))
        throw new Error('Unsupported custom property')
    })
    const result = generate(ast)
    // Decoded strings can introduce '<' even when the source used a CSS escape.
    return result.includes('<') ? '' : result
  } catch {
    return ''
  }
}

const SINGLE_CLICK_READ_KEY = 'dripfeed.singleClickRead'

/**
 * Mark an item read on a single click instead of a double click. Defaults to
 * off: the long-standing behaviour is single click to select, double click to
 * mark read.
 */
export function loadSingleClickRead(): boolean {
  try {
    return localStorage.getItem(SINGLE_CLICK_READ_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSingleClickRead(v: boolean): void {
  try {
    localStorage.setItem(SINGLE_CLICK_READ_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
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
