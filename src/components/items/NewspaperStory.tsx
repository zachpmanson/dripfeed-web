import { IconStar, IconStarFilled, IconCircle, IconCircleFilled } from '@tabler/icons-react'
import { memo, useMemo, useState } from 'react'
import type { NewsItem, NewsFeed } from '../../api/types'
import { FeedIcon } from '../feed/FeedIcon'
import { IconButton } from '../ui/IconButton'
import { previewExcerpt, previewImage, previewTitle } from './newspaperPreview'
import { newspaperExcerptLimit, type NewspaperRole } from './newspaperPresentation'

export default memo(function NewspaperStory({
  item,
  index,
  total,
  role,
  feedTitle,
  feedById,
  showFavicons = true,
  singleClickRead,
  onSelect,
  onRead,
  onStar,
}: {
  item: NewsItem
  index?: number
  total?: number
  role: NewspaperRole
  feedTitle: (feedId: number) => string
  feedById?: (feedId: number) => NewsFeed | undefined
  showFavicons?: boolean
  singleClickRead: boolean
  onSelect: (id: number) => void
  onRead: (item: NewsItem) => void
  onStar?: (item: NewsItem) => void
}) {
  const feed = showFavicons ? feedById?.(item.feedId) : undefined
  const excerpt = useMemo(() => previewExcerpt(item, newspaperExcerptLimit(role)), [item, role])
  const image = useMemo(
    () => (role === 'lead' || role === 'feature' || role === 'image' ? previewImage(item) : null),
    [item, role],
  )
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const title = useMemo(() => previewTitle(item), [item])
  const imagePreview = image && (
    <div
      className={`my-5 overflow-hidden bg-app-bg ${role === 'image' ? 'aspect-[1.5]' : 'aspect-[2.28]'} ${role === 'lead' ? 'max-h-80' : ''}`}
    >
      {failedImage !== image ? (
        <img
          className="h-full w-full object-cover"
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedImage(image)}
        />
      ) : (
        <span className="flex h-full items-center justify-center text-xs text-app-muted">
          Image unavailable
        </span>
      )}
    </div>
  )
  return (
    <li
      aria-posinset={index === undefined ? undefined : index + 1}
      aria-setsize={total}
      className={`newspaper-story newspaper-${role} mb-6 min-w-0 border-b border-app-border pb-6`}
    >
      <article dir={item.rtl ? 'rtl' : 'auto'}>
        <header dir="ltr" className="mb-3 flex items-start justify-between gap-3">
          <div
            dir="auto"
            className="flex min-h-[16px] min-w-0 flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-widest text-app-muted"
          >
            <span className="inline-flex min-w-0 max-w-full items-center gap-2">
              {feed && <FeedIcon feed={feed} />}
              <span className="min-w-0 [overflow-wrap:anywhere]">{feedTitle(item.feedId)}</span>
            </span>
            {item.pubDate && (
              <time dateTime={new Date(item.pubDate).toISOString()}>
                {new Date(item.pubDate).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })}
              </time>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <IconButton
              variant="bare"
              size="compact"
              title={`${item.starred ? 'Unstar' : 'Star'}: ${title}`}
              pressed={item.starred}
              onClick={() => onStar?.(item)}
            >
              {item.starred ? (
                <IconStarFilled aria-hidden="true" />
              ) : (
                <IconStar aria-hidden="true" />
              )}
            </IconButton>
            <IconButton
              variant="bare"
              size="compact"
              title={`Mark ${item.unread ? 'read' : 'unread'}: ${title}`}
              onClick={() => onRead(item)}
            >
              {item.unread ? (
                <IconCircleFilled aria-hidden="true" />
              ) : (
                <IconCircle aria-hidden="true" />
              )}
            </IconButton>
          </div>
        </header>
        <h2
          className={`newspaper-headline m-0 mb-3 font-normal ${item.unread ? 'text-app-text' : 'text-app-muted'}`}
        >
          <button
            className="block w-full border-0 bg-transparent p-0 text-start text-inherit [font:inherit] [letter-spacing:inherit] hover:underline focus-visible:outline-2 focus-visible:outline-app-accent"
            data-story-id={item.id}
            onClick={() => {
              onSelect(item.id)
              if (singleClickRead && item.unread) onRead(item)
            }}
          >
            {title}
          </button>
        </h2>
        {role === 'image' && imagePreview}
        {excerpt && (
          <p
            className={`newspaper-excerpt m-0 ${item.unread ? 'text-app-text' : 'text-app-muted'}`}
          >
            {excerpt}
          </p>
        )}
        {role !== 'image' && imagePreview}
      </article>
    </li>
  )
})
