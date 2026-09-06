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
export function Seg<T extends string | number | boolean>({ options, value, onChange, title }: Props<T>) {
  return (
    <div className="seg" title={title}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          className={value === opt.value ? 'active' : ''}
          title={opt.title}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
