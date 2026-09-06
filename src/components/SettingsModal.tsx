import type { ThemeSetting, ArticleCssMode } from '../theme'
import { GIT_SHA, BUILD_TIME, REPO_URL } from '../version'
import { Seg } from './Seg'

interface Props {
  uiTheme: ThemeSetting
  articleTheme: ThemeSetting
  articleCssMode: ArticleCssMode
  articleCss: string
  showFavicons: boolean
  onUiTheme: (v: ThemeSetting) => void
  onArticleTheme: (v: ThemeSetting) => void
  onArticleCssMode: (v: ArticleCssMode) => void
  onArticleCss: (v: string) => void
  onShowFavicons: (v: boolean) => void
  onLogout: () => void
  onClose: () => void
}

export function SettingsModal({
  uiTheme,
  articleTheme,
  articleCssMode,
  articleCss,
  showFavicons,
  onUiTheme,
  onArticleTheme,
  onArticleCssMode,
  onArticleCss,
  onShowFavicons,
  onLogout,
  onClose,
}: Props) {
  const customOpen = articleCssMode === 'custom'
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="muted">Settings</span>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
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
            <span className="setting-label">Article dark mode</span>
            <Seg<ThemeSetting>
              value={articleTheme}
              onChange={onArticleTheme}
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
              <textarea
                className="css-input"
                value={articleCss}
                onChange={(e) => onArticleCss(e.target.value)}
                placeholder={"/* Custom CSS, applied on top of the default.\n   url() and @import are stripped. */"}
                spellCheck={false}
              />
              <div className="css-actions">
                <span className="muted hint">Applied live to the open article</span>
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
            <a
              className="setting-label repo-link"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
            >
              dripfeed-web ↗
            </a>
            <span className="muted commit-ref">
              <a href={`${REPO_URL}/commit/${GIT_SHA}`} target="_blank" rel="noreferrer">
                {GIT_SHA}
              </a>
              {BUILD_TIME && (
                <>
                  <br />
                  <span className="commit-time">{new Date(BUILD_TIME).toLocaleString()}</span>
                </>
              )}
            </span>
          </div>
          <div className="setting-row">
            <button className="danger-btn" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}