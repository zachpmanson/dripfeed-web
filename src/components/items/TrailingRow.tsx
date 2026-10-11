import { Spinner } from '../ui/Spinner'
import type { LoadMoreProgress } from '../../store'

export default function TrailingRow({
  sentinelRef,
  onLoadMore,
  moreServer,
  drained,
  loadingMore,
  paging,
}: {
  sentinelRef: React.RefObject<HTMLLIElement>
  onLoadMore?: () => void
  moreServer: boolean
  drained: boolean
  loadingMore: boolean
  paging?: LoadMoreProgress | null
}) {
  const more = moreServer && !drained
  const progress =
    paging && paging.totalFeeds > 0
      ? `Paging feed ${Math.min(paging.feedsPaged, paging.totalFeeds)} of ${paging.totalFeeds}…`
      : null

  if (!more) {
    return (
      <li
        ref={sentinelRef}
        className="list-none border-b border-app-border p-2 text-center text-[0.7rem] uppercase tracking-wider"
      >
        <span className="text-app-muted">— up to date —</span>
      </li>
    )
  }
  return (
    <li ref={sentinelRef} className="list-none border-b border-app-border p-2 text-center">
      {loadingMore || progress ? (
        <span className="flex items-center justify-center gap-2 text-app-muted">
          <Spinner />
          {progress ?? 'Loading…'}
        </span>
      ) : (
        <button className="w-full p-2" onClick={onLoadMore}>
          Load more
        </button>
      )}
    </li>
  )
}
