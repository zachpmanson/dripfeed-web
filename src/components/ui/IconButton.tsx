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
      className={`inline-flex items-center justify-center rounded p-1 text-app-muted hover:bg-app-border hover:text-app-text disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent disabled:hover:text-app-muted ${className ?? ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
