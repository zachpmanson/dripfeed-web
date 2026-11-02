import { RadioGroup } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'

interface SegOption<T> {
  value: T
  label: string
  title?: string
}

interface Props<T> {
  options: SegOption<T>[]
  value: T
  onChange: (value: T) => void
  title?: string
}

/** A mandatory, typed segmented choice shared by app preferences. */
export function Seg<T extends string | number | boolean>({
  options,
  value,
  onChange,
  title,
}: Props<T>) {
  return (
    <RadioGroup
      className="flex overflow-hidden rounded-md border border-app-border"
      aria-label={title ?? options.map((option) => option.label).join(' / ')}
      value={value}
      required
      onValueChange={(next) => {
        if (options.some((option) => option.value === next)) onChange(next)
      }}
    >
      {options.map((opt) => (
        <Radio.Root
          render={<button type="button" />}
          nativeButton
          key={String(opt.value)}
          value={opt.value}
          className={`border-0 rounded-none px-2.5 py-1.5 text-sm ${value === opt.value ? 'relative z-10 bg-app-accent font-semibold text-app-on-accent shadow-[inset_0_0_0_1px_var(--active-inset)]' : 'bg-transparent text-app-muted opacity-85 hover:text-app-text'}`}
          title={opt.title}
        >
          {opt.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}
