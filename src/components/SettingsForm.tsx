import { useState } from 'react'
import { saveSettings } from '../settings'
import type { Settings } from '../settings'

interface Props {
  initial: Settings | null
  notice?: string
  onSave: (s: Settings) => void
}

export function SettingsForm({ initial, onSave, notice }: Props) {
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '')
  const [user, setUser] = useState(initial?.user ?? '')
  const [appPassword, setAppPassword] = useState(initial?.appPassword ?? '')

  return (
    <div className="settings">
      <h1>Dripfeed</h1>
      <p className="muted">
        Connect to your Nextcloud News instance. Use an <strong>app password</strong> (Profile
        → Security), not your main account password.
      </p>
      {notice && <p className="error">{notice}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const s: Settings = { baseUrl: baseUrl.trim(), user: user.trim(), appPassword }
          saveSettings(s)
          onSave(s)
        }}
      >
        <label>
          Nextcloud URL
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="same origin (leave empty)"
          />
          <span className="muted hint">Leave empty when served from dripfeed.zachmanson.com — the /apps proxy handles it.</span>
        </label>
        <label>
          Username
          <input type="text" value={user} onChange={(e) => setUser(e.target.value)} required />
        </label>
        <label>
          App password
          <input
            type="password"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit">Connect</button>
      </form>
    </div>
  )
}