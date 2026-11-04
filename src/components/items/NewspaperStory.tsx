import { useMemo, useState } from 'react'
import type { NewsItem } from '../../api/types'
import { previewExcerpt, previewImage, previewTitle } from './newspaperPreview'

export default function NewspaperStory({
  item,
  lead,
  feedTitle,
  singleClickRead,
  onSelect,
  onRead,
  onStar,
}: {
  item: NewsItem
  lead: boolean
  feedTitle: (feedId: number) => string
  singleClickRead: boolean
  onSelect: (id: number) => void
  onRead: (item: NewsItem) => void
  onStar?: (item: NewsItem) => void
}) {
  const excerpt = useMemo(() => previewExcerpt(item), [item])
  const image = lead ? previewImage(item) : null
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const title = useMemo(() => previewTitle(item), [item])
  return (
    <li
      className={`newspaper-story min-w-0 border-b border-app-border pb-6 ${lead ? 'newspaper-lead' : ''}`}
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
        {excerpt && (
          <p
            className={`newspaper-excerpt m-0 ${item.unread ? 'text-app-text' : 'text-app-muted'}`}
          >
            {excerpt}
          </p>
        )}
        {image && (
          <div className="mt-5 aspect-[2.28] overflow-hidden bg-app-bg">
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
        )}
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
}
