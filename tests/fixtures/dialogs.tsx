import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AddModal } from '../../src/components/feed/AddModal'
import { FeedSettingsModal } from '../../src/components/feed/FeedSettingsModal'
import { SettingsModal } from '../../src/components/settings/SettingsModal'
import type { NewsFeed } from '../../src/api/types'
import '../../src/index.css'

const noop = () => {}
const settings = { baseUrl: '', user: 'test', appPassword: 'test' }
const feed = { id: 42, title: 'Example feed', fullTextEnabled: false } as NewsFeed
function Harness() {
  const [open, setOpen] = useState('')
  const [css, setCss] = useState('p { color: red; }')
  const [cssMode, setCssMode] = useState<'custom' | 'default'>('custom')
  const [stack, setStack] = useState('')
  const close = () => setOpen('')
  useEffect(() => {
    const changeStack = (event: Event) => {
      const kind = (event as CustomEvent<string>).detail
      setStack(kind === 'reset' ? '' : kind)
      if (kind === 'reset') setOpen('')
    }
    window.addEventListener('fixture-stack', changeStack)
    return () => window.removeEventListener('fixture-stack', changeStack)
  }, [])
  return (
    <>
      <button id="settings" onClick={() => setOpen('settings')}>
        Open settings
      </button>
      <button id="add" onClick={() => setOpen('add')}>
        Open add
      </button>
      <button id="feed" data-feed-id="42" onClick={() => setOpen('feed')}>
        Open feed settings
      </button>
      <input id="background" aria-label="Background input" />
      <iframe
        className="block"
        title="Background article"
        srcDoc={
          '<button id="article" onclick="document.body.dataset.clicked = \'true\'">Article button</button>'
        }
      />
      {(open === 'settings' || stack === 'settings') && (
        <SettingsModal
          feeds={[]}
          folders={[]}
          uiTheme="dark"
          articleCssMode={cssMode}
          articleCss={css}
          showFavicons
          singleClickRead
          dimBoilerplate
          onUiTheme={noop}
          onArticleCssMode={setCssMode}
          onArticleCss={setCss}
          onShowFavicons={noop}
          onSingleClickRead={noop}
          onDimBoilerplate={noop}
          onLogout={noop}
          onClose={stack === 'settings' ? () => setStack('') : close}
        />
      )}
      {(open === 'add' || stack === 'add') && (
        <AddModal
          settings={settings}
          folders={[]}
          onClose={stack === 'add' ? () => setStack('') : close}
          onCreated={noop}
        />
      )}
      {(open === 'feed' || stack === 'feed') && (
        <FeedSettingsModal
          settings={settings}
          feed={feed}
          onClose={stack === 'feed' ? () => setStack('') : close}
          onChanged={noop}
        />
      )}
    </>
  )
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
