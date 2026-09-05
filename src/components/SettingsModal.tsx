import type { ThemeSetting } from '../theme'

interface Props {
  uiTheme: ThemeSetting
  articleTheme: ThemeSetting
  showFavicons: boolean
  onUiTheme: (v: ThemeSetting) => void
  onArticleTheme: (v: ThemeSetting) => void
  onShowFavicons: (v: boolean) => void
  onLogout: () => void
  onClose: () => void
}

function Seg({
  value,
  onChange,
}: {
  value: ThemeSetting
  onChange: (v: ThemeSetting) => void
}) {
  const opts: ThemeSetting[] = ['light', 'dark', 'system']
  return (
    <div className="seg">
      {opts.map((o) => (
        <button
          key={o}
          className={value === o ? 'active' : ''}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

export function SettingsModal({
  uiTheme,
  articleTheme,
  showFavicons,
  onUiTheme,
  onArticleTheme,
  onShowFavicons,
  onLogout,
  onClose,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="muted">settings</span>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="settings-form">
          <div className="setting-row">
            <span className="setting-label">UI dark mode</span>
            <Seg value={uiTheme} onChange={onUiTheme} />
          </div>
          <div className="setting-row">
            <span className="setting-label">Article dark mode</span>
            <Seg value={articleTheme} onChange={onArticleTheme} />
          </div>
          <div className="setting-row">
            <label className="setting-label checkbox">
              <input
                type="checkbox"
                checked={showFavicons}
                onChange={(e) => onShowFavicons(e.target.checked)}
              />
              show favicons
            </label>
          </div>
          <div className="setting-row">
            <button className="danger-btn" onClick={onLogout}>
              log out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}