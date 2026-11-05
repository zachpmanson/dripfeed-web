import { forwardRef, useId, type ReactNode } from 'react'
import { Tooltip } from '@base-ui/react/tooltip'

interface Props {
  title: string
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  pressed?: boolean
  border?: boolean
  className?: string
  variant?: 'default' | 'bare'
  size?: 'default' | 'compact'
}

/** A small square header/reader icon button (glyph or SVG child). */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  {
    title,
    onClick,
    children,
    disabled,
    pressed,
    border = false,
    className,
    variant = 'default',
    size = 'default',
  },
  ref,
) {
  const tooltipId = useId()
  const sizeClasses =
    size === 'compact' ? 'size-[16px] [&>svg]:size-[16px]' : 'size-8 [&>svg]:size-6'
  const variantClasses = variant === 'bare' ? 'bg-transparent' : 'bg-app-panel'
  const borderClasses = border ? 'border border-app-border' : 'border-0'
  const stateClasses = pressed
    ? 'text-app-accent hover:text-app-accent'
    : 'text-app-muted hover:text-app-text'

  return (
    <Tooltip.Root disabled={disabled}>
      <Tooltip.Trigger
        ref={ref}
        render={<button type="button" disabled={disabled} />}
        className={`inline-flex shrink-0 items-center justify-center rounded p-0 ${sizeClasses} ${stateClasses} ${variantClasses} ${borderClasses} hover:bg-app-border disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent disabled:hover:text-app-muted ${className ?? ''}`}
        aria-label={title}
        aria-pressed={pressed}
        aria-describedby={tooltipId}
        onClick={onClick}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-[1100]">
          <Tooltip.Popup
            id={tooltipId}
            role="tooltip"
            className="max-w-80 rounded border border-app-border bg-app-panel px-2 py-1 text-xs text-app-text shadow-lg"
          >
            {title}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
})
