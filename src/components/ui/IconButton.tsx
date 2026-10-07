import type { ReactNode } from 'react'

interface Props {
  title: string
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  className?: string
}

/** A small square header/reader icon button (glyph or SVG child). */
export function IconButton({ title, onClick, children, disabled, className }: Props) {
  return (
    <button
      className={`icon-btn${className ? ` ${className}` : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
