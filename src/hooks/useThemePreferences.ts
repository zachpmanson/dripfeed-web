import { useEffect, useState } from 'react'
import { loadDimBoilerplate, saveDimBoilerplate } from '../boilerplate'
import {
  applyUiTheme,
  loadArticleCss,
  loadArticleCssMode,
  loadShowFavicons,
  loadSingleClickRead,
  loadThemeSetting,
  sanitizeArticleCss,
  saveArticleCss,
  saveArticleCssMode,
  saveShowFavicons,
  saveSingleClickRead,
  saveThemeSetting,
  uiThemeKey,
  type ArticleCssMode,
  type ThemeSetting,
} from '../theme'

export default function useThemePreferences() {
  const [uiTheme, setUiThemeState] = useState<ThemeSetting>(() => loadThemeSetting(uiThemeKey))
  const [articleCssMode, setArticleCssModeState] = useState<ArticleCssMode>(loadArticleCssMode)
  const [articleCss, setArticleCssState] = useState<string>(loadArticleCss)
  const [showFavicons, setShowFaviconsState] = useState<boolean>(loadShowFavicons)
  const [singleClickRead, setSingleClickReadState] = useState<boolean>(loadSingleClickRead)
  const [dimBoilerplate, setDimBoilerplateState] = useState<boolean>(loadDimBoilerplate)

  useEffect(() => {
    applyUiTheme(uiTheme)
    if (uiTheme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyUiTheme(uiTheme)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [uiTheme])

  const setUiTheme = (value: ThemeSetting) => {
    // Apply before React rerenders so consumers reading computed CSS tokens see
    // the selected palette in that render (not the previous theme).
    applyUiTheme(value)
    setUiThemeState(value)
    saveThemeSetting(uiThemeKey, value)
  }
  const setArticleCssMode = (value: ArticleCssMode) => {
    setArticleCssModeState(value)
    saveArticleCssMode(value)
  }
  const setArticleCss = (value: string) => {
    // Sanitize on save so hostile url()/@import never reaches the frame.
    setArticleCssState(value)
    saveArticleCss(sanitizeArticleCss(value))
  }
  const setShowFavicons = (value: boolean) => {
    setShowFaviconsState(value)
    saveShowFavicons(value)
  }
  const setSingleClickRead = (value: boolean) => {
    setSingleClickReadState(value)
    saveSingleClickRead(value)
  }
  const setDimBoilerplate = (value: boolean) => {
    setDimBoilerplateState(value)
    saveDimBoilerplate(value)
  }

  return {
    uiTheme,
    articleCssMode,
    articleCss,
    showFavicons,
    singleClickRead,
    dimBoilerplate,
    setUiTheme,
    setArticleCssMode,
    setArticleCss,
    setShowFavicons,
    setSingleClickRead,
    setDimBoilerplate,
  }
}
