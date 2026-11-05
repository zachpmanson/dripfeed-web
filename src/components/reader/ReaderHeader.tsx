import {
  IconFileText,
  IconStar,
  IconStarFilled,
  IconCircleFilled,
  IconCircle,
} from '@tabler/icons-react'
import { useEffect, useRef } from 'react'
import type { NewsItem } from '../../api/types'
import type { useStore } from '../../hooks'
import { titleFor } from '../../utils'
import { IconButton } from '../ui/IconButton'
import { Spinner } from '../ui/Spinner'

export default function ReaderHeader({
  item,
  focusTitle = false,
  actions,
  extracting,
  extractError,
  autoExtract,
  onExtract,
}: {
  item: NewsItem
  focusTitle?: boolean
  actions: ReturnType<typeof useStore>['actions']
  extracting: boolean
  extractError: string | null
  autoExtract: boolean
  onExtract: () => void
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusTitle) titleRef.current?.focus({ preventScroll: true })
  }, [focusTitle, item.id])

  return (
    <div className="m-0 flex items-start justify-between gap-3">
      <h2
        ref={titleRef}
        tabIndex={-1}
        className="m-0 min-w-0 text-[1.15rem] leading-[1.3] font-bold [overflow-wrap:anywhere]"
      >
        <a
          className="text-app-text no-underline hover:underline"
          href={item.url}
          target="_blank"
          rel="noreferrer"
        >
          {titleFor(item)}
        </a>
      </h2>
      <div className="m-0 flex shrink-0 gap-[0.4rem]">
        <IconButton
          variant="bare"
          title={item.starred ? 'Unstar' : 'Star'}
          onClick={() => actions.setStar(item, !item.starred)}
          className="text-[1.05rem] leading-none"
        >
          {item.starred ? (
            <IconStarFilled className="btn-icon" aria-hidden="true" />
          ) : (
            <IconStar className="btn-icon" aria-hidden="true" />
          )}
        </IconButton>
        <IconButton
          variant="bare"
          title={
            extractError
              ? `Extract full article — ${extractError}`
              : autoExtract
                ? 'Extract full article — this feed defaults to the extracted article'
                : 'Extract full article from the original URL'
          }
          disabled={extracting}
          onClick={onExtract}
          className="text-[1.05rem] leading-none"
        >
          {extracting ? <Spinner /> : <IconFileText className="btn-icon" aria-hidden="true" />}
        </IconButton>
        <IconButton
          variant="bare"
          title={item.unread ? 'Mark read' : 'Mark unread'}
          onClick={() => actions.setRead(item, !item.unread)}
          className="text-[1.05rem] leading-none"
        >
          {item.unread ? (
            <IconCircleFilled className="btn-icon" aria-hidden="true" />
          ) : (
            <IconCircle className="btn-icon" aria-hidden="true" />
          )}
        </IconButton>
      </div>
    </div>
  )
}
