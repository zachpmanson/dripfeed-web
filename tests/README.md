# Browser regression: iframe footnotes

`iframe-footnotes.mjs` starts a temporary Vite server and renders the real
`ItemView` in Chromium, including its sandboxed `srcdoc` iframe. No Nextcloud
credentials or live article requests are needed. It checks cross-realm element
identity, nested footnote links, backlinks, missing targets, temporary highlights,
iframe scrolling, and navigation after a srcdoc reload. It also checks that
external/relative links still open separately without an opener, the parent URL
is unchanged, and article scripts remain blocked by the unchanged sandbox.

Use a Playwright installation (no new project dependency is required):

```sh
nix develop --command pnpm install --frozen-lockfile
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
CHROMIUM_PATH=/path/to/chromium \
TEST_ARTIFACT_DIR=/tmp/iframe-footnotes \
nix develop --command pnpm test:browser
```

`PLAYWRIGHT_MODULE` points to the package directory containing `index.mjs`.
Without it, the script imports `playwright` normally. `CHROMIUM_PATH` is optional
when Playwright's bundled Chromium is installed. `TEST_ARTIFACT_DIR` is optional;
when set, it receives `result.json` and `footnote.png`. The script prints its JSON
observations and exits nonzero on failure. Browser execution is separate from
`pnpm test`, which runs the existing Vitest unit tests.

The original parent-window `instanceof Element` / `HTMLAnchorElement` checks
fail this regression: the span and anchor are instances of the iframe's
constructors, not the parent's. The footnote click is not prevented, leaves the
frame at scroll position zero, adds no highlight, and opens an unwanted popup.

# Dialog accessibility regression

`dialogs.browser.mjs` starts a temporary Vite server and drives the real Settings,
Add and Feed settings components via Chromium's raw CDP protocol and Node's
built-in WebSocket. No Playwright installation, API credentials or new dependency
is required. The fixture never submits API writes.

```sh
CHROMIUM_PATH=/path/to/chromium \
TEST_ARTIFACT_DIR=/tmp/dialog-accessibility \
nix develop --command node tests/dialogs.browser.mjs
```

It exercises real Enter/Tab/Shift-Tab/Escape input, edge wrapping, initial and
restored focus, all dismissal paths, backdrop-vs-content/drag clicks, blocked
background article clicks, accessible dialog names and CSS field description,
and small-viewport scrolling in both themes. Optional artifacts include JSON
results and dark/light screenshots. The fixture uses StrictMode, like the app.

The five React/jsdom tests in `src/components/ui/Dialog.test.tsx` cover lifecycle,
cancel handling, Tab handler wiring, backdrop decisions, custom CSS callbacks,
and existing Add/feed settings busy/error/success flows. jsdom has no native
`showModal`, inertness, layout or default Tab navigation: those are explicitly
shimmed, not claimed as browser evidence. Native modality and user keyboard
behavior are verified by the separate Chromium run. Scripted focus into an
inert iframe is not an adversarial-security guarantee of this correction.
