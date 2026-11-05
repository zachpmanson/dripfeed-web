import { memo, useMemo, useState } from 'react'
import type { NewsItem } from '../../api/types'
import { previewExcerpt, previewImage, previewTitle } from './newspaperPreview'
import { newspaperExcerptLimit, type NewspaperRole } from './newspaperPresentation'

export default memo(function NewspaperStory({
  item,
  index,
  total,
  role,
  feedTitle,
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
  singleClickRead: boolean
  onSelect: (id: number) => void
  onRead: (item: NewsItem) => void
  onStar?: (item: NewsItem) => void
}) {
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
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-widest text-app-muted">
          <span>{feedTitle(item.feedId)}</span>
          {item.pubDate && (
            <time dateTime={new Date(item.pubDate).toISOString()}>
              {new Date(item.pubDate).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              })}
            </time>
          )}
        </div>
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
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-app-muted">
          <button
            className={`min-h-8 rounded-none border-0 bg-transparent px-0 hover:text-app-text ${item.starred ? 'text-app-accent' : ''}`}
            aria-label={`${item.starred ? 'Unstar' : 'Star'}: ${title}`}
            aria-pressed={item.starred}
            onClick={() => onStar?.(item)}
          >
            {item.starred ? '★ Starred' : '☆ Star'}
          </button>
          <button
            className="min-h-8 rounded-none border-0 bg-transparent px-0 hover:text-app-text"
            aria-label={`Mark ${item.unread ? 'read' : 'unread'}: ${title}`}
            onClick={() => onRead(item)}
          >
            Mark {item.unread ? 'read' : 'unread'}
          </button>
        </div>
      </article>
    </li>
  )
})
