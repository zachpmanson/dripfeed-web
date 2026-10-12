import type { ReactNode } from 'react'

interface Props {
  title: string
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  className?: string
  variant?: 'default' | 'ghost'
}

/** A small square header/reader icon button (glyph or SVG child). */
export function IconButton({
  title,
  onClick,
  children,
  disabled,
  className,
  variant = 'default',
}: Props) {
  const variantClasses =
    variant === 'ghost'
      ? 'border border-transparent bg-transparent'
      : 'border border-app-border bg-app-panel'

  return (
    <button
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded p-0 text-app-muted ${variantClasses} hover:bg-app-border hover:text-app-text disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent disabled:hover:text-app-muted [&>svg]:size-[1em] ${className ?? ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
