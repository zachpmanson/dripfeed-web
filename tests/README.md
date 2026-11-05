# Browser regression: article table centering

`article-tables.mjs` renders the real `ItemView` with narrow, multi-column and
non-wrapping tables. Chromium checks centering at 360px, 1000px and 1600px,
viewport gutters, constrained prose, no page-level horizontal overflow, and
reachable content through a wide table's own scrollbar.

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
CHROMIUM_PATH=/path/to/chromium \
TEST_ARTIFACT_DIR=/tmp/article-tables \
nix develop --command node tests/article-tables.mjs
```

No API credentials or live feed requests are needed. Optional artifacts include
layout metrics and screenshots for each viewport.

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
and small-viewport scrolling in both themes. It additionally checks dynamic Settings
editor/reset transitions, pointer opening, rapid reopen, reverse backdrop drags,
restored iframe interaction, and all four Settings↔Add/feed-settings mixed-owner
Escape cases. Mixed checks are mandatory, not opt-in. The expanded feed-auth form also checks
labelled/masked optional credentials, clearing on reopen, small-viewport containment
and keyboard wrapping without submitting an API write. All non-fixture requests
are blocked before navigation, including same-origin `/apps` GETs that Vite would
otherwise proxy to the real News server. A synthetic fulltext request verifies
that block. Optional artifacts include JSON results and desktop/dark/light
screenshots. The fixture uses StrictMode, like the app. Parent-side scripted iframe
focus is recorded as a diagnostic only: Chromium permits it in the unchanged native
baseline too; it is not an adversarial inertness or sandbox guarantee.

Settings, Add and Feed settings use Base UI with a shared active-owner stack.
The fixture also retains a real isolated native Dialog probe, including both
native/Base cover directions, covered-owner removal and atomic replacements. The runner distinguishes mounted forms from the one presented
owner and checks both sides of Escape, preserved fields, removed covered owners,
actual same-commit replacements and three-owner handoffs. Current fixes and
passing evidence: [base-ui-components.md](base-ui-components.md), following the
[Settings-only fix](settings-base-ui-fix.md). The initial
failed experiment remains in [settings-base-ui-pilot.md](settings-base-ui-pilot.md)
as historical evidence, not the current decision.

The React/jsdom tests in `src/components/ui/Dialog.test.tsx` cover lifecycle,
cancel handling, Tab handler wiring, backdrop decisions, custom CSS callbacks,
existing Add/feed settings busy/error/success flows, feed-credential submission,
retry/clearing behavior, and the unsupported-instance hint. jsdom has no native
`showModal`, inertness, layout or default Tab navigation: those are explicitly
shimmed, not claimed as browser evidence. Native modality and user keyboard
behavior are verified by the separate Chromium run. `BaseDialog.test.tsx` and
`ModalLayer.test.tsx` additionally cover the library lifecycle, persistent-target
replacement, suspension without form remount, StrictMode and atomic opener-chain
handoff. Their native shims are wiring tests, not browser evidence. Scripted
iframe focus is not an adversarial-security guarantee of this correction.

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

# Browser regression: global error toast

`error-toast.browser.mjs` renders the real toast and app CSS with local fixture
state in StrictMode; it does not contact the News API. Chromium checks 360px,
768px and 1600px viewports in both themes, long-message containment and scrolling,
unchanged reader geometry, no focus theft, a usable dismiss target, keyboard
Tab/Enter dismissal and background interaction while the toast is visible. All
non-fixture requests are blocked. Screenshots and JSON metrics are optional.

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
CHROMIUM_PATH=/path/to/chromium \
TEST_ARTIFACT_DIR=/tmp/error-toast \
nix develop --command node tests/error-toast.browser.mjs
```

This is a bounded component/browser regression, not a live account check or a
screen-reader announcement test. `src/hooks.errors.test.tsx` separately exercises
the real store hook, reader and toast with mocked API/data operations: extraction
rejections stay local, 401 still invalidates authentication, stale-session
failures cannot report, and dismissed consecutive errors stay deduplicated
through background polling. The toast has no auto-dismiss timer; reset/logout
and unmount invalidate its session and clear the error/dedup state.

# Browser regression: feed menu and Base controls

`feed-controls.browser.mjs` renders the real StrictMode Sidebar/FeedRow, Add,
Settings and shared controls. Fixture-only Vite module mocks replace News writes,
mark-read and clipboard operations; all non-fixture traffic and every /apps path
(including a synthetic fulltext GET probe) are blocked before navigation.

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
CHROMIUM_PATH=/path/to/chromium \
TEST_ARTIFACT_DIR=/tmp/feed-controls \
nix develop --command node tests/feed-controls.browser.mjs
```

Checks include pointer/keyboard context invocation and collision bounds, managed
submenu keys/scrolling, no selection/clickthrough, deferred write errors/retry and
duplicate guards, native prompt/confirm cancellation, 700ms copy acknowledgement
and stale lifetime isolation, settings handoff to replaced/removed persistent
rows, typed Select/RadioGroup values (including 0/false), modal Select layering
and Escape, checkbox booleans, Tooltip keyboard labels, keyboard Tabs/auth clearing
and busy Add cover/uncover. Toast replacement and persistence beyond five seconds
are exercised without replacing app error/session ownership. Existing error-toast
and session tests remain separate. Menu geometry compares page width to the
fixture's inherited desktop-header baseline; it does not claim a responsive app
layout redesign. Optional JSON/screenshot artifacts follow the other runners.

# Newspaper chunk virtualization

Newspaper mode uses measured grid sections of 50 ranked stories dealt round-robin
into 1–3 independent column stacks (17rem minimum width, 1.75rem gap). Only the
viewport sections plus one whole section ahead/behind are mounted (at most five
sections / 250 stories). Initially only 100 cached stories contribute scroll space;
each near-tail approach reveals another 50. Unrevealed stories have no placeholders.
Previously visited offscreen sections retain measured or width-aware estimated
height placeholders. A deep URL selection can explicitly represent its prefix
without mounting it. This bounds rendering and the initial scroll range, not the
existing unread fetch, ranking sample, IndexedDB mirror or server cursors.
On entry, the first section contains the spanning lead; remaining ranks are dealt
A1,4,7 / B2,5,8 / C3,6,9. Story IDs then retain their section, column and visual
role through removals, read/star refreshes and arrivals (new IDs append after the
existing owners, even if newer in the caller's ranking). Removing the lead does
not promote another story. Empty sections disappear; gaps are not backfilled
from other columns/sections. Exposure counts surviving stories, so repeated reads
do not strand the cached tail behind empty slots. View/sort/filter switches and
column-count changes rebalance; ordinary width changes within the same count do
not. Removed IDs retain metadata until reset so rollback restores their ownership.
Each column stays ranked; accessible positions use the surviving ownership order.
DOM/keyboard traversal runs down columns, not visual row-major order.
Variable-height stories are not pixel-aligned masonry rows. List mode remains unchanged.

Newspaper layout changes use a 180ms Web Animations translation of surviving,
currently mounted articles. A read calls the existing mutation immediately;
affected-column survivors glide into the closed gap without retaining an exiting
card, delaying the mutation, or handling errors separately. A rollback can glide
survivors back. Common visible IDs also glide on genuine view/sort/filter resets;
only a bounded geometry snapshot crosses the existing keyed reset, not nodes,
animations, paging or reader state. New mounts, initial width resolution,
hidden-reader returns and scroll-induced virtualization window swaps do not
animate. Across view resets both old and new positions must be visible, avoiding
long flights from overscanned or deep stories after scroll resets. Unsupported
Web Animations and reduced-motion users get immediate layout; changing to reduced
motion cancels in-flight animations. Animations are canceled on removal/hiding/
unmount and keep neither story DOM nor pending timers alive. Rapid consecutive
changes retarget from the current animated position. Scroll anchors use
untransformed layout coordinates, not the temporary article translation; motion
also accounts for layout-driven scroll corrections. This is position-only motion,
not height/role/image morphing or an exit effect. A read toggle that leaves layout
unchanged (e.g. in all-items mode) does not animate.

The next section is rendered before its leading edge enters the viewport. Local
reveal and server prefetch use two viewport heights (at least 1200px) of headroom.
Cached stories are exposed before fetching the server. One step per approach/current
data window avoids draining history inside that margin; no-growth results settle
and the explicit Load more button is local-first. There is no app Back control;
browser Back/popstate restores the front-page scroll and headline, while opening
an article focuses its heading.

```sh
nix develop --command pnpm test src/components/items/NewspaperList.test.tsx src/components/items/newspaperOwnership.test.ts src/components/items/useNewspaperMotion.test.tsx src/App.newspaper.test.tsx --maxWorkers=2
```

These tests execute queued animation frames and mocked ResizeObserver/scroll
geometry against a 10,000-story fixture: bounded initial/deep-link/fast-jump DOM,
both directions, balanced ranked column tops across chunks/resizes, measured-height
reuse, resize/image-height anchors, early overscan/prefetch, hidden/stale callbacks,
actions/heading focus/browser history Back, empty-page settling,
read-removal rearming and ordinary list behavior. Ownership tests additionally
cover lead/chunk-boundary/bulk removals, new arrivals, read/star updates, rollback,
responsive and explicit view resets. Motion tests use mocked rectangles and Web
Animations to check ID-keyed translations, unaffected columns, no initial/entry/
scroll animation, cancellation, reduced motion, cross-session visible-ID sorting,
responsive sparse-window resets, rapid retargeting and untransformed anchors. A
component regression checks immediate read dispatch, focus and a simulated
optimistic rollback; existing action tests cover API mutation rollback separately.
They are **not native browser grid/stack geometry, frame-rate, actual animation
playback or screen-reader measurements**. No new Chromium harness is included.

A separate, temporary parent-owned Chromium 156 smoke probe verified real 180ms
animation playback, stable columns/roles and gap closure after a read, removal of
a lone lead/sparse section, visible common-ID motion across a sort reset,
reduced-motion suppression and responsive redistribution to two columns. It used
synthetic local articles, blocked non-fixture requests, and observed no browser
exceptions; it was not an authenticated account or frame-rate test. Cold font
loading can cause a subsequent animated reflow after initial mount. Evidence is
retained at `~/.local/state/slippy/dripfeed-stable-columns/browser-result.json`.

# Interface icon migration

App-owned interface icons use pinned `@tabler/icons-react` components, including
loading/refresh, stars, read state, disclosure/select carets, custom checkbox
indicators, close/external-link/copy controls and missing-feed RSS fallback.
Decorative SVGs stay hidden from assistive technology; the owning controls retain
their accessible labels and actions. Filled and outline icons preserve state.

The custom Dripfeed favicon and real feed favicons are branding/content, not
generic control icons; they remain unchanged. Browser-drawn native checkbox
chrome also remains native. Article HTML and content imagery are not rewritten.

Component tests assert positive Tabler SVG markers, state transitions, callbacks,
labels, favicon failure fallback and CSS animation/reduced-motion wiring. The
existing feed-controls browser runner has its caret assertion updated for SVG,
but no browser run is implied by component tests or the production/Nix build.
Dependency changes require the matching `fetchPnpmDeps` hash in `nix/package.nix`.
