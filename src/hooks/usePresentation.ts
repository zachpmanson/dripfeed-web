import { useEffect, useState } from 'react'

export type Presentation = 'list' | 'newspaper'
const KEY = 'dripfeed.presentation'

export default function usePresentation() {
  const [presentation, setPresentation] = useState<Presentation>(() => {
    try {
      return localStorage.getItem(KEY) === 'newspaper' ? 'newspaper' : 'list'
    } catch {
      return 'list'
    }
  })
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
    newspaper: presentation === 'newspaper',
  }
}
