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

/** A bordered segmented toggle (e.g. only-unread/all, newest/rarity). */
export function Seg<T extends string | number | boolean>({
  options,
  value,
  onChange,
  title,
}: Props<T>) {
  return (
    <div className="flex overflow-hidden rounded-md border border-app-border" title={title}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          className={`border-0 rounded-none px-2.5 py-1.5 text-sm ${value === opt.value ? 'relative z-10 bg-app-accent font-semibold text-app-on-accent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]' : 'bg-transparent text-app-muted opacity-85 hover:text-app-text'}`}
          title={opt.title}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
