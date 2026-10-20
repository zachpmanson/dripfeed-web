import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AddModal } from '../../src/components/feed/AddModal'
import { FeedSettingsModal } from '../../src/components/feed/FeedSettingsModal'
import { SettingsModal } from '../../src/components/settings/SettingsModal'
import type { NewsFeed } from '../../src/api/types'
import '../../src/index.css'

const noop = () => {}
const settings = { baseUrl: 'http://invalid.test', user: 'test', appPassword: 'test' }
const feed = { id: 42, title: 'Example feed', fullTextEnabled: false } as NewsFeed
function Harness() {
  const [open, setOpen] = useState('')
  const [css, setCss] = useState('p { color: red; }')
  const close = () => setOpen('')
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
      {open === 'settings' && (
        <SettingsModal
          feeds={[]}
          folders={[]}
          uiTheme="dark"
          articleCssMode="custom"
          articleCss={css}
          showFavicons
          singleClickRead
          dimBoilerplate
          onUiTheme={noop}
          onArticleCssMode={noop}
          onArticleCss={setCss}
          onShowFavicons={noop}
          onSingleClickRead={noop}
          onDimBoilerplate={noop}
          onLogout={noop}
          onClose={close}
        />
      )}
      {open === 'add' && (
        <AddModal settings={settings} folders={[]} onClose={close} onCreated={noop} />
      )}
      {open === 'feed' && (
        <FeedSettingsModal settings={settings} feed={feed} onClose={close} onChanged={noop} />
      )}
    </>
  )
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
