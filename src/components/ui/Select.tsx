import { Select as BaseSelect } from '@base-ui/react/select'

/** Single mandatory choice; values stay typed across the popup boundary. */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled = false,
  className = '',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <BaseSelect.Root
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (!disabled && next !== null && options.some((option) => option.value === next))
          onChange(next)
      }}
    >
      <BaseSelect.Trigger
        aria-label={label}
        className={`inline-flex cursor-pointer items-center justify-between gap-2 rounded-md border border-app-border bg-app-panel px-2 py-1 text-[0.85rem] leading-[1.4] text-app-text hover:border-app-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-default disabled:opacity-60 ${className}`}
      >
        <BaseSelect.Value />
        <BaseSelect.Icon aria-hidden>▾</BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className="z-[1100]"
          sideOffset={4}
          align="start"
          alignItemWithTrigger={false}
          collisionPadding={8}
        >
          <BaseSelect.Popup className="max-h-[min(var(--available-height),20rem)] min-w-[var(--anchor-width)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border border-app-border bg-app-panel p-1 text-sm text-app-text shadow-lg">
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  className="cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-app-border data-[selected]:font-semibold [overflow-wrap:anywhere]"
                >
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
