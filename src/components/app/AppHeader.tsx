import { Select } from '../ui/Select'
import { IconSettings, IconPlus } from '@tabler/icons-react'
import { IconButton } from '../ui/IconButton'
import { Seg } from '../ui/Seg'
import { Spinner } from '../ui/Spinner'
import type { ShowMode, SortMode } from '../../views'
import type { Presentation } from '../../hooks/usePresentation'

export type { ShowMode, SortMode } from '../../views'

export default function AppHeader({
  showMode,
  onShowModeChange,
  sortMode,
  onSortModeChange,
  syncing,
  poolLength,
  onSync,
  onAdd,
  onSettings,
  presentation = 'list',
  onPresentationChange,
}: {
  presentation?: Presentation
  onPresentationChange?: (mode: Presentation) => void
  showMode: ShowMode
  onShowModeChange: (mode: ShowMode) => void
  sortMode: SortMode
  onSortModeChange: (mode: SortMode) => void
  syncing: boolean
  poolLength: number
  onSync: () => void
  onAdd: () => void
  onSettings: () => void
}) {
  return (
    <header className="flex items-center justify-between border-b border-app-border bg-app-panel px-4 py-2.5">
      <h1 className="m-0 text-base tracking-[0.02em]">Dripfeed</h1>
      <div className="header-right flex items-center gap-2">
        <Select<ShowMode>
          className="header-select"
          label="Items shown: all, unread only, or all items with unread floated to the top"
          value={showMode}
          onChange={onShowModeChange}
          options={[
            { value: 'all', label: 'All items' },
            { value: 'unread', label: 'Unread only' },
            { value: 'priority', label: 'Unread first' },
          ]}
        />
        <Seg<SortMode>
          value={sortMode}
          onChange={onSortModeChange}
          options={[
            { value: 'newest', label: 'Newest' },
            { value: 'rarity', label: 'Rarity', title: 'Weighted rarity: rare feeds first' },
          ]}
        />
        {onPresentationChange && (
          <Seg<Presentation>
            title="Presentation"
            value={presentation}
            onChange={onPresentationChange}
            options={[
              { value: 'list', label: 'List' },
              { value: 'newspaper', label: 'Newspaper' },
            ]}
          />
        )}
        <IconButton
          className={`add-btn sync${syncing ? ' syncing' : ''}`}
          title={`Refresh now — re-sync newest items, feeds and folders (${poolLength} local)`}
          onClick={onSync}
        >
          <Spinner />
        </IconButton>
        <IconButton className="add-btn" title="Add feed or folder" onClick={onAdd}>
          <IconPlus className="btn-icon" aria-hidden="true" />
        </IconButton>
        <IconButton className="add-btn" title="Settings" onClick={onSettings}>
          <IconSettings className="btn-icon" aria-hidden="true" />
        </IconButton>
      </div>
    </header>
  )
}
