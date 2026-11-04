import { useEffect, useState } from 'react'

export type Presentation = 'list' | 'newspaper'
export const NEWSPAPER_QUERY = '(min-width: 1100px)'
const KEY = 'dripfeed.presentation'

export default function usePresentation() {
  const [presentation, setPresentation] = useState<Presentation>(() => {
    try {
      return localStorage.getItem(KEY) === 'newspaper' ? 'newspaper' : 'list'
    } catch {
      return 'list'
    }
  })
  const [desktop, setDesktop] = useState(
    () => window.matchMedia?.(NEWSPAPER_QUERY).matches ?? false,
  )
  useEffect(() => {
    const query = window.matchMedia?.(NEWSPAPER_QUERY)
    if (!query) return
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(KEY, presentation)
    } catch {
      // The choice still works for this session when storage is unavailable.
    }
  }, [presentation])
  return {
    presentation,
    setPresentation,
    desktop,
    newspaper: desktop && presentation === 'newspaper',
  }
}
