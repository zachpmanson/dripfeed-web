import { useState } from 'react'
import type { NewsFeed } from '../api/types'

interface Props {
  feed: NewsFeed
  size?: number // px, default 16
}

/**
 * Feed favicon: renders the feed's faviconLink image, falling back to a
 * rounded letter tile (first char of the title) when there's no favicon or
 * it fails to load.
 */
export function FeedIcon({ feed, size = 16 }: Props) {
  const [failed, setFailed] = useState(false)
  const href = feed.faviconLink
  const showImg = href && !failed

  if (!showImg) {
    return (
      <span
        className="feed-icon fallback"
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: size * 0.62 }}
      >
        {(feed.title || '?').trim().charAt(0).toUpperCase()}
      </span>
    )
  }
  return (
    <img
      className="feed-icon"
      src={href}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}