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
    <div className="reader-head">
      <h2 className="reader-title">
        <a href={item.url} target="_blank" rel="noreferrer">
          {titleFor(item)}
        </a>
      </h2>
      <div className="reader-actions">
        <IconButton
          title={item.starred ? 'Unstar' : 'Star'}
          onClick={() => actions.setStar(item, !item.starred)}
        >
          {item.starred ? (
            <SolidStarIcon className="btn-icon" aria-hidden="true" />
          ) : (
            <StarIcon className="btn-icon" aria-hidden="true" />
          )}
        </IconButton>
        <IconButton
          title={
            extractError
              ? `Extract full article — ${extractError}`
              : autoExtract
                ? 'Extract full article — this feed defaults to the extracted article'
                : 'Extract full article from the original URL'
          }
          disabled={extracting}
          onClick={onExtract}
        >
          {extracting ? (
            <Spinner />
          ) : (
            <DocumentTextIcon className="btn-icon" aria-hidden="true" />
          )}
        </IconButton>
        <IconButton
          title={item.unread ? 'Mark read' : 'Mark unread'}
          onClick={() => actions.setRead(item, !item.unread)}
        >
          {item.unread ? '●' : '○'}
        </IconButton>
      </div>
    </div>
  )
}
