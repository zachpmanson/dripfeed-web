import { forwardRef, useId, type ReactNode } from 'react'
import { Tooltip } from '@base-ui/react/tooltip'

interface Props {
  title: string
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  border?: boolean
  className?: string
  variant?: 'default' | 'bare'
}

/** A small square header/reader icon button (glyph or SVG child). */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { title, onClick, children, disabled, border = false, className, variant = 'default' },
  ref,
) {
  const tooltipId = useId()
  const variantClasses = variant === 'bare' ? 'bg-transparent' : 'bg-app-panel'
  const borderClasses = border ? 'border border-app-border' : 'border-0'

  return (
    <Tooltip.Root disabled={disabled}>
      <Tooltip.Trigger
        ref={ref}
        render={<button type="button" disabled={disabled} />}
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded p-0 text-app-muted ${variantClasses} ${borderClasses} hover:bg-app-border hover:text-app-text disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent disabled:hover:text-app-muted [&>svg]:size-6 ${className ?? ''}`}
        aria-label={title}
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
