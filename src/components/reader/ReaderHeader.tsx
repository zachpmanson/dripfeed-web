import { DocumentTextIcon, StarIcon } from '@heroicons/react/24/outline'
import { StarIcon as SolidStarIcon } from '@heroicons/react/24/solid'
import type { NewsItem } from '../../api/types'
import type { useStore } from '../../hooks'
import { titleFor } from '../../utils'
import { IconButton } from '../ui/IconButton'
import { Spinner } from '../ui/Spinner'

export default function ReaderHeader({
  item,
  actions,
  extracting,
  extractError,
  autoExtract,
  onExtract,
}: {
  item: NewsItem
  actions: ReturnType<typeof useStore>['actions']
  extracting: boolean
  extractError: string | null
  autoExtract: boolean
  onExtract: () => void
}) {
  return (
    <div className="m-0 flex items-start justify-between gap-3">
      <h2 className="m-0 text-[1.15rem] leading-[1.3] font-bold">
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
            <SolidStarIcon className="btn-icon" aria-hidden="true" />
          ) : (
            <StarIcon className="btn-icon" aria-hidden="true" />
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
          {extracting ? <Spinner /> : <DocumentTextIcon className="btn-icon" aria-hidden="true" />}
        </IconButton>
        <IconButton
          variant="bare"
          title={item.unread ? 'Mark read' : 'Mark unread'}
          onClick={() => actions.setRead(item, !item.unread)}
          className="text-[1.05rem] leading-none"
        >
          {item.unread ? '●' : '○'}
        </IconButton>
      </div>
    </div>
  )
}
