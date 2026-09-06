import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Short git sha + build time, visible in the settings popup. Prefer env vars
// (the nix build passes the flake's locked rev + commit date via VITE_* since
// `src = lib.cleanSource` strips .git, so execSync would fail there); fall
// back to a live git query for local dev.
function gitSha(): string {
  if (process.env.VITE_GIT_SHA) return process.env.VITE_GIT_SHA
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

function buildTime(): string {
  if (process.env.VITE_BUILD_TIME) {
    // Unix-seconds timestamp from the nix flake (self.lastModified);
    // format to ISO. Plain strings (e.g. tests) pass through.
    const t = process.env.VITE_BUILD_TIME
    if (/^\d+$/.test(t)) return new Date(Number(t) * 1000).toISOString()
    return t
  }
  return new Date().toISOString()
}

export default defineConfig({
  define: {
    __GIT_SHA__: JSON.stringify(gitSha()),
    __BUILD_TIME__: JSON.stringify(buildTime()),
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