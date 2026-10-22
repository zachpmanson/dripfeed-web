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
and small-viewport scrolling in both themes. The expanded feed-auth form also checks
labelled/masked optional credentials, clearing on reopen, small-viewport containment
and keyboard wrapping without submitting an API write. Optional artifacts include JSON
results and dark/light screenshots. The fixture uses StrictMode, like the app.

The React/jsdom tests in `src/components/ui/Dialog.test.tsx` cover lifecycle,
cancel handling, Tab handler wiring, backdrop decisions, custom CSS callbacks,
existing Add/feed settings busy/error/success flows, feed-credential submission,
retry/clearing behavior, and the unsupported-instance hint. jsdom has no native
`showModal`, inertness, layout or default Tab navigation: those are explicitly
shimmed, not claimed as browser evidence. Native modality and user keyboard
behavior are verified by the separate Chromium run. Scripted focus into an
inert iframe is not an adversarial-security guarantee of this correction.

# Browser regression: custom article CSS

`article-css.browser.mjs` renders the real `ItemView`, intercepting **all** remote
requests at browser-context level (probe requests are fulfilled locally, never
forwarded). It checks escaped URL/import tokens, string-source image-set, literal
resources, and mixed-case style end tags inside raw CSS/comments/strings. Each
unsafe sheet must be rejected entirely, without new DOM nodes or probe requests.
Positive controls verify ordinary rgb/calc/media typography, absolute and
base-relative article images (including naturalWidth), and a separate deliberately
unsanitized resource-loading iframe. Default mode, theme reloads, CSS updates,
and the unchanged script-blocking sandbox are also checked.

```sh
nix develop --command pnpm exec vitest run src/theme.test.ts
nix develop --command pnpm typecheck
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
CHROMIUM_PATH=/path/to/chromium \
TEST_ARTIFACT_DIR=/tmp/article-css \
nix develop --command node tests/article-css.browser.mjs
```

The JSON output and optional `result.json` include the browser version, intercepted
URLs/types/frames, DOM observations, custom style output, and computed typography.
For a **pre-fix** reproduction only, set `EXPECT_VULNERABLE=1`: the same runner then
requires actual intercepted escaped URL/import/image-set and breakout requests.
No probe request is forwarded in either mode. These are bounded browser
regressions, not a zero-resource guarantee for arbitrary article HTML/styles.

Custom CSS intentionally supports only known AST nodes, ordinary typography,
explicit math/color/pseudo-selector functions, and parsed `@media`/`@supports`.
Unknown syntax/functions, resources, all other at-rules, custom properties and
var/env substitution reject the whole sheet. `<` is rejected both before parsing
and after serialization to protect the HTML style boundary; stored CSS is not
rewritten. Built-in theme CSS and article HTML/image handling are unaffected.
