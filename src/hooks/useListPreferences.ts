import { useEffect, useState } from 'react'
import type { ShowMode, SortMode } from '../views'

const SORT_KEY = 'dripfeed.sort'
const SHOW_MODE_KEY = 'dripfeed.showMode'
const LEGACY_SHOW_ALL_KEY = 'dripfeed.showAll'

export default function useListPreferences() {
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const stored = localStorage.getItem(SORT_KEY)
    return stored === 'newest' ? 'newest' : 'rarity'
  })
  const [showMode, setShowMode] = useState<ShowMode>(() => {
    const stored = localStorage.getItem(SHOW_MODE_KEY)
    if (stored === 'all' || stored === 'unread' || stored === 'priority') return stored
    // One-time migration from the old boolean toggle ('1' = all).
    return localStorage.getItem(LEGACY_SHOW_ALL_KEY) === '1' ? 'all' : 'priority'
  })

  useEffect(() => {
    localStorage.setItem(SORT_KEY, sortMode)
  }, [sortMode])

  useEffect(() => {
    localStorage.setItem(SHOW_MODE_KEY, showMode)
  }, [showMode])

  return { sortMode, setSortMode, showMode, setShowMode }
}
