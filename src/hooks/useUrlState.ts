import { useCallback, useEffect, useState, type SetStateAction } from 'react'
import { parseUrlState, urlForState, type UrlState } from '../urlState'
import type { View } from '../views'

type NavigationState = UrlState & { historyMode: 'push' | 'replace' }

/** Keep the open view and selected item in sync with the browser URL/history. */
export default function useUrlState() {
  const [state, setState] = useState<NavigationState>(() => ({
    ...parseUrlState(window.location.search),
    historyMode: 'replace',
  }))

  const setView = useCallback((value: SetStateAction<View>) => {
    setState((previous) => ({
      ...previous,
      view: typeof value === 'function' ? value(previous.view) : value,
      historyMode: 'push',
    }))
  }, [])
  const setSelectedId = useCallback((value: SetStateAction<number | null>) => {
    setState((previous) => ({
      ...previous,
      selectedId: typeof value === 'function' ? value(previous.selectedId) : value,
      historyMode: 'push',
    }))
  }, [])

  // Initial/popstate cleanup replaces the current entry. Only user navigation
  // pushes; writing both values together avoids stale items on view switches.
  useEffect(() => {
    const url = urlForState(window.location.href, state)
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (url !== current) {
      if (state.historyMode === 'replace')
        window.history.replaceState(window.history.state, '', url)
      else window.history.pushState(null, '', url)
    }
  }, [state])

  useEffect(() => {
    const onPop = () => {
      setState({ ...parseUrlState(window.location.search), historyMode: 'replace' })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return { view: state.view, setView, selectedId: state.selectedId, setSelectedId }
}
