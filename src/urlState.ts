import type { View } from './views'

export interface UrlState {
  view: View
  selectedId: number | null
}

/** Domain IDs must survive numeric conversion without losing integer precision. */
export function parsePositiveSafeInteger(value: string | null): number | null {
  const id = value === null ? NaN : Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

// URL scheme: ?view=all|allUnread|starred|feed|folder&id=<n>&item=<n>
export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search)
  const kind = params.get('view')
  const id = parsePositiveSafeInteger(params.get('id'))
  let view: View = { kind: 'all' }
  if (kind === 'allUnread' || kind === 'starred') view = { kind }
  else if ((kind === 'feed' || kind === 'folder') && id !== null) view = { kind, id }
  return { view, selectedId: parsePositiveSafeInteger(params.get('item')) }
}

/** Change only navigation parameters, retaining other query parameters and the hash. */
export function urlForState(currentUrl: string, { view, selectedId }: UrlState): string {
  const url = new URL(currentUrl)
  url.searchParams.set('view', view.kind)
  if (view.kind === 'feed' || view.kind === 'folder') {
    url.searchParams.set('id', String(view.id))
  } else {
    url.searchParams.delete('id')
  }
  if (selectedId === null) url.searchParams.delete('item')
  else url.searchParams.set('item', String(selectedId))
  return `${url.pathname}${url.search}${url.hash}`
}
