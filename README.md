# dripfeed-web

A fast, self-hostable web client for [Nextcloud News](https://apps.nextcloud.com/apps/news), with **rarity-weighted sorting**. Works in the browser, talks to the News REST API, and mirrors your feeds into IndexedDB so it stays snappy offline-ish.

Live at [dripfeed.zachmanson.com](https://dripfeed.zachmanson.com).

## Features

- **Rarity sorting** — cross-feed views rank by rarity (scaling real post age by inverse power law of feed posting frequency), computed over each feed's newest 20 items. Feed/folder views stay newest-first.
- **Unread-only browsing** — per-feed/folder native unread queries; all unread items arrive in one request.
- **Full-article extraction** — a button in the reader header fetches the original URL via the News server's built-in scraper (`GET /apps/news/items/{id}/fulltext`) and swaps in the extracted body.
- **Per-feed settings** — right-click a feed → *Feed settings* to default a feed to full-article extraction. The flag is the News server's own per-feed `fullTextEnabled` (`PATCH /apps/news/feeds/{feedId}`), so the server scrapes new items as they arrive and other clients see the full text too; the reader also extracts existing items as you open them.
- **Custom article CSS** — replace or extend the reader's default stylesheet from Settings (live preview, `url()`/`@import` stripped).
- **Offline-ish local mirror** — newest-20-per-feed + full starred set in IndexedDB; optimistic read/star toggles; a 3-minute background poll (plus a wake on tab focus/visibility) that reconciles read/star state changed by other clients through the server's `/items/updated` delta.
- **Themes** — independent UI and article light/dark/system modes; show/hide favicons.
- **Click to read** — double click an item to mark it read (the default), or enable single click in Settings.

## How it works

- **Stack:** Vite + React + TypeScript + `idb` (IndexedDB). No backend — it talks straight to the News REST API.
- **Auth:** HTTP Basic with your Nextcloud **app password** (use an app password, not your real one). Credentials are stored in `localStorage`.
- **Same-origin proxy:** the app expects `/apps/*` to be reverse-proxied to your Nextcloud (the production caddy vhost does this; the dev server proxies to `nextcloud.zachmanson.com` by default — see `vite.config.ts`). Basic auth works because requests are same-origin.

## Development

Requires Node + pnpm (or `nix develop` — the flake ships a devshell).

```bash
pnpm install
pnpm dev          # vite dev server (proxies /apps/* to nextcloud.zachmanson.com)
pnpm build        # typecheck + production build to dist/
pnpm typecheck    # tsc --noEmit only
```

The Makefile wraps these (`make dev`, `make build`, `make typecheck`).

## Deploying (Nix)

The repo's flake builds a static bundle (`nix build .#default`, output in `dist/`). The nix build inlines the locked git rev + build date into the bundle so the Settings panel shows the real commit. On Zach's infra it deploys via `deploy-service dripfeed-web` (see `hosts/naboo/services/caddy.nix` in the nix repo).

## Configuration

Point it at your own Nextcloud by leaving the URL blank when served behind a proxy, or set a full base URL in the login form (versioned API routes support CORS; full-article extraction needs same-origin).
