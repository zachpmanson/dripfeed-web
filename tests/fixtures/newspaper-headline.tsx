import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ItemList } from '../../src/components/items/ItemList'
import type { NewsItem } from '../../src/api/types'
import '../../src/index.css'

const initial = Array.from({ length: 3000 }, (_, index) => ({
  id: index + 1,
  feedId: 1,
  title: `Article ${index + 1} — a variable length newspaper headline ${'detail '.repeat(index % 5)}`,
  body: `<p>${'A local synthetic article excerpt. '.repeat(3 + (index % 19))}</p>`,
  unread: true,
  starred: false,
  rtl: false,
  url: 'https://fixture.invalid/story',
  pubDate: 1700000000 - index,
})) as NewsItem[]

function Fixture() {
  const [items, setItems] = useState(initial)
  const [active, setActive] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [tallLead, setTallLead] = useState(false)
  Object.assign(window, {
    fixture: {
      remove: (id: number) => setItems((old) => old.filter((item) => item.id !== id)),
      restore: () => setItems(initial),
      hide: (id: number) => {
        setSelected(id)
        setActive(false)
      },
      show: () => setActive(true),
      tallLead: () => setTallLead(true),
    },
  })
  return (
    <>
      {/* Deliberately skew heights to expose grid row barriers and origin mistakes. */}
      <style>{`.newspaper-lead { min-height: ${tallLead ? 6000 : 640}px; }
      .newspaper-story:has([data-story-id="4"]) { min-height: 1800px; }`}</style>
      <div
        style={{
          height: '100dvh',
          minWidth: 0,
          flexDirection: 'column',
          display: active ? 'flex' : 'none',
        }}
      >
        <ItemList
          newspaper
          windowKey="fixture"
          active={active}
          selectedId={selected}
          items={items}
          feedTitle={() => 'Local fixture'}
          onSelect={(id) => {
            setSelected(id)
            setActive(false)
          }}
          onRead={(item) => setItems((old) => old.filter((entry) => entry.id !== item.id))}
          onStar={(item) =>
            setItems((old) =>
              old.map((entry) =>
                entry.id === item.id ? { ...entry, starred: !entry.starred } : entry,
              ),
            )
          }
        />
      </div>
    </>
  )
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
)
