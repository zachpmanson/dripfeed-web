import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Short git sha of the current checkout, visible in the settings popup.
try {
  var GIT_SHA = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  var GIT_SHA = 'unknown'
}

export default defineConfig({
  define: {
    __GIT_SHA__: JSON.stringify(GIT_SHA),
  },
  plugins: [react()],
  server: {
    // Local dev against the real instance: proxy the News API same-origin so
    // we never rely on CORS. Matches the production caddy layout.
    proxy: {
      '/apps': {
        target: 'https://nextcloud.zachmanson.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})