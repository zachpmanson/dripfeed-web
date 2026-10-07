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
      <li ref={sentinelRef} className="load-more-row done">
        <span className="muted">— up to date —</span>
      </li>
    )
  }
  return (
    <li ref={sentinelRef} className="load-more-row">
      {loadingMore || progress ? (
        <span className="muted spinner-row">
          <Spinner />
          {progress ?? 'Loading…'}
        </span>
      ) : (
        <button className="load-more" onClick={onLoadMore}>
          Load more
        </button>
      )}
    </li>
  )
}
