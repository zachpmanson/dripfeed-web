import { useId } from 'react'
import { ArrowTopRightOnSquareIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { ThemeSetting, ArticleCssMode } from '../../theme'
import { GIT_SHA, REPO_URL, deployLabel } from '../../version'
import { Dialog } from '../ui/Dialog'
import { Seg } from '../ui/Seg'
import type { NewsFeed, NewsFolder } from '../../api/types'
import { downloadOpml } from '../../opml'

interface Props {
  feeds: NewsFeed[]
  folders: NewsFolder[]
  uiTheme: ThemeSetting
  articleCssMode: ArticleCssMode
  articleCss: string
  showFavicons: boolean
  singleClickRead: boolean
  dimBoilerplate: boolean
  onUiTheme: (v: ThemeSetting) => void
  onArticleCssMode: (v: ArticleCssMode) => void
  onArticleCss: (v: string) => void
  onShowFavicons: (v: boolean) => void
  onSingleClickRead: (v: boolean) => void
  onDimBoilerplate: (v: boolean) => void
  onLogout: () => void
  onClose: () => void
}

export function SettingsModal({
  feeds,
  folders,
  uiTheme,
  articleCssMode,
  articleCss,
  showFavicons,
  singleClickRead,
  dimBoilerplate,
  onUiTheme,
  onArticleCssMode,
  onArticleCss,
  onShowFavicons,
  onSingleClickRead,
  onDimBoilerplate,
  onLogout,
  onClose,
}: Props) {
  const titleId = useId()
  const cssId = useId()
  const cssHintId = useId()
  const customOpen = articleCssMode === 'custom'
  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <div className="modal-head">
        <span id={titleId} className="muted">
          Settings
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="close">
          <XMarkIcon className="btn-icon" aria-hidden="true" />
        </button>
      </div>
      <div className="settings-form">
        <div className="setting-row">
          <span className="setting-label">UI dark mode</span>
          <Seg<ThemeSetting>
            value={uiTheme}
            onChange={onUiTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
        <div className="setting-row">
          <span className="setting-label">Article CSS</span>
          <Seg<ArticleCssMode>
            value={articleCssMode}
            onChange={onArticleCssMode}
            options={[
              { value: 'default', label: 'Default' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </div>
        {customOpen && (
          <div className="css-editor">
            <label className="sr-only" htmlFor={cssId}>
              Custom article CSS
            </label>
            <textarea
              id={cssId}
              aria-describedby={cssHintId}
              className="css-input"
              value={articleCss}
              onChange={(e) => onArticleCss(e.target.value)}
              placeholder={
                '/* Typography CSS with math/color functions and @media/@supports.\n   Entire sheet ignored for resources, var/env, custom properties,\n   other functions/at-rules, invalid syntax, or < characters. */'
              }
              spellCheck={false}
            />
            <div className="css-actions">
              <span id={cssHintId} className="muted hint">
                Applied live to the open article. Unsupported or resource-loading CSS is ignored.
              </span>
              <button
                className="danger-btn"
                onClick={() => {
                  onArticleCss('')
                  onArticleCssMode('default')
                }}
              >
                Reset to default
              </button>
            </div>
          </div>
        )}
        <div className="setting-row">
          <label className="setting-label checkbox">
            <input
              type="checkbox"
              checked={showFavicons}
              onChange={(e) => onShowFavicons(e.target.checked)}
            />
            Show favicons
          </label>
        </div>
        <div className="setting-row">
          <label className="setting-label checkbox">
            <input
              type="checkbox"
              checked={singleClickRead}
              onChange={(e) => onSingleClickRead(e.target.checked)}
            />
            Mark as read on single click
          </label>
        </div>
        <div className="setting-row">
          <label className="setting-label checkbox">
            <input
              type="checkbox"
              checked={dimBoilerplate}
              onChange={(e) => onDimBoilerplate(e.target.checked)}
            />
            Dim Boilerplate Text
          </label>
        </div>
        <div className="setting-row">
          <a className="setting-label repo-link" href={REPO_URL} target="_blank" rel="noreferrer">
            dripfeed-web <ArrowTopRightOnSquareIcon className="menu-icon" aria-hidden="true" />
          </a>
          <span className="muted commit-ref">
            <a href={`${REPO_URL}/commit/${GIT_SHA}`} target="_blank" rel="noreferrer">
              {deployLabel()}
            </a>
          </span>
        </div>
        <div className="setting-row">
          <button onClick={() => downloadOpml(feeds, folders)}>Export OPML</button>
        </div>
        <div className="setting-row">
          <button className="danger-btn" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
    </Dialog>
  )
}
