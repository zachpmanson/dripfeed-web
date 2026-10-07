import { useEffect, useState } from 'react'
import type { View } from '../views'

/** Keep the open view and selected item in sync with the browser URL/history. */
export default function useUrlState() {
  const [view, setView] = useState<View>(() => viewFromUrl())
  const [selectedId, setSelectedId] = useState<number | null>(() => itemIdFromUrl())

  // Each navigation creates one history entry. Writing both values together
  // avoids retaining a selected item after switching to another view.
  useEffect(() => {
    writeUrl(view, selectedId)
  }, [view, selectedId])

  // Back/forward restores the view and item without adding a duplicate entry.
  useEffect(() => {
    const onPop = () => {
      setView(viewFromUrl())
      setSelectedId(itemIdFromUrl())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return { view, setView, selectedId, setSelectedId }
}

// URL scheme: ?view=all|allUnread|starred|feed|folder&id=<n>&item=<n>
function viewFromUrl(): View {
  const p = new URLSearchParams(window.location.search)
  const kind = p.get('view')
  const id = p.get('id')
  switch (kind) {
    case 'allUnread':
      return { kind: 'allUnread' }
    case 'starred':
      return { kind: 'starred' }
    case 'feed':
      return id ? { kind: 'feed', id: Number(id) } : { kind: 'all' }
    case 'folder':
      return id ? { kind: 'folder', id: Number(id) } : { kind: 'all' }
    default:
      return { kind: 'all' }
  }
}

function itemIdFromUrl(): number | null {
  const value = new URLSearchParams(window.location.search).get('item')
  const id = value ? Number(value) : NaN
  return Number.isFinite(id) && id > 0 ? id : null
}

/** pushState preserves the navigation trail; skip writes after popstate. */
function writeUrl(view: View, selectedId: number | null): void {
  const p = new URLSearchParams(window.location.search)
  if (view.kind === 'feed' || view.kind === 'folder') {
    p.set('view', view.kind)
    p.set('id', String(view.id))
  } else {
    p.set('view', view.kind)
    p.delete('id')
  }
  if (selectedId === null) p.delete('item')
  else p.set('item', String(selectedId))
  const qs = p.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  if (window.location.search !== `?${qs}`) {
    window.history.pushState(null, '', url)
  }
}
