import { Cog6ToothIcon, PlusIcon } from '@heroicons/react/24/outline'
import { IconButton } from '../ui/IconButton'
import { Seg } from '../ui/Seg'
import { Spinner } from '../ui/Spinner'
import type { ShowMode, SortMode } from '../../views'

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
}: {
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
    <header className="app-header">
      <h1>Dripfeed</h1>
      <div className="header-right">
        <select
          className="header-select"
          title="Items shown: all, unread only, or all items with unread floated to the top"
          value={showMode}
          onChange={(e) => onShowModeChange(e.target.value as ShowMode)}
        >
          <option value="all">All items</option>
          <option value="unread">Unread only</option>
          <option value="priority">Unread first</option>
        </select>
        <Seg<SortMode>
          value={sortMode}
          onChange={onSortModeChange}
          options={[
            { value: 'newest', label: 'Newest' },
            { value: 'rarity', label: 'Rarity', title: 'Weighted rarity: rare feeds first' },
          ]}
        />
        <IconButton
          className={`add-btn sync${syncing ? ' syncing' : ''}`}
          title={`Refresh now — re-sync newest items, feeds and folders (${poolLength} local)`}
          onClick={onSync}
        >
          <Spinner />
        </IconButton>
        <IconButton className="add-btn" title="Add feed or folder" onClick={onAdd}>
          <PlusIcon className="btn-icon" />
        </IconButton>
        <IconButton className="add-btn" title="Settings" onClick={onSettings}>
          <Cog6ToothIcon className="btn-icon" />
        </IconButton>
      </div>
    </header>
  )
}
