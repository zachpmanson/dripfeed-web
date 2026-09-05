import type { NewsItem } from '../api/types'

interface Props {
  items: NewsItem[]
  selectedId: number | null
  feedTitle: (feedId: number) => string
  onSelect: (id: number) => void
  onRead: (item: NewsItem) => void // optimistic removal hook once read
}

export function ItemList({ items, selectedId, feedTitle, onSelect, onRead }: Props) {
  const sorted = [...items].sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
  return (
    <ul className="item-list">
      {sorted.map((item) => (
        <li
          key={item.id}
          className={item.id === selectedId ? 'item selected' : 'item'}
          onClick={() => onSelect(item.id)}
          onDoubleClick={() => onRead(item)}
        >
          <div className="item-title">{item.title || '(untitled)'}</div>
          <div className="item-meta">
            <span className="feed">{feedTitle(item.feedId)}</span>
            <span className="muted">{formatDate(item.pubDate)}</span>
            {item.starred && <span aria-label="starred">★</span>}
          </div>
        </li>
      ))}
      {sorted.length === 0 && (
        <li className="muted">No unread items. Nothing dripping?</li>
      )}
    </ul>
  )
}

function formatDate(ms: number | null): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}