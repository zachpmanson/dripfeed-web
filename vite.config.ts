import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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