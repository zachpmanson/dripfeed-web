# Settings Base UI pilot — 2 November 2026 (Melbourne)

> **Historical snapshot, superseded:** the owner subsequently requested fixing
> the problems rather than rejecting the migration. Settings' restored Base UI
> implementation and passing ownership fixes are documented in
> [settings-base-ui-fix.md](settings-base-ui-fix.md). The receipts below remain
> unchanged as evidence of the original failed experiment.

## Initial decision: retain the native dialog

The Settings-only `@base-ui/react@1.9.0` experiment failed the mixed-overlay
parity gate. It is **not accepted for integration or deployment**. The final
branch restores the original application code, dependencies, lockfile and Nix
dependency hash; only enhanced synthetic browser coverage and this receipt remain.
No context-menu or remaining-modal migration was attempted. No PR, merge or
deployment was performed.

- Baseline: `9fd506f83ec81ac444710586e67f0cf03f6224cb` (`origin/master`).
- Rejected experiment: `a5b46a0` (its ordinary build/unit checks pass, but its
  mandatory browser gate fails; do not adopt that commit by itself).
- Work ran in owned worktrees; the dirty shared checkout was not edited.
- Author/committer timestamps use the explicitly requested time-travel mapping;
  they are not actual execution times. This affects Git metadata only.

## Findings

The separate 48-line candidate adapter changed only Settings' import. Add and
Feed settings retained the native wrapper. React 18 compatibility was verified
against the pinned release's peer metadata. No React upgrade was needed.

The ordinary checks passed for all three modals: accessible names, CSS field
name/description, initial/returned focus, Tab/Shift-Tab, padding and both drag
directions, Escape/close/backdrop, blocked background pointer activation,
restored iframe interaction, credential-reset behavior, small-screen scroll and
scrim in both themes. Settings additionally passed pointer opening, dynamic CSS
editor/reset, current Tab edges and repeated close/reopen. Desktop Settings
geometry was identical: 352 × 629.34375 CSS pixels at 1000 × 800.

**Mixed-owner failure:** when Settings is open and a native Add or Feed settings
dialog then mounts, one Escape closes the underlying Settings instead of the
new native dialog. The candidate's document-level library Escape handler prevents
native cancellation and calls Settings' `onClose`. All four mixed combinations
pass with the unchanged native implementation; two fail with the candidate.
These are synthetic forced coexistence checks against the application's separate
modal owners, **not proof that an ordinary user can click through a modal**.
The reverse orders pass the post-Escape assertion but do not establish correct
pre-Escape mixed stacking. A safe mixed-owner policy would need separate design
and broader tests, not a larger z-index or an unreviewed ownership rewrite.

**Scripted iframe probe is diagnostic, not a regression:** both the native
control and candidate permit parent-side programmatic focus into this same-origin
iframe in Chromium 153. It is not a new Base UI failure or sandbox escape.
Real Tab traversal, accessibility-tree exclusion and pointer blocking remain
behavioral assertions. Do not equate those checks with an adversarial inertness
or screen-reader audit. This control experiment overrides the initial static
review's suspicion that scripted focus was a candidate-only regression.

## Measured production assets

Same source baseline, toolchain and build commands; actual emitted file bytes,
with Node `gzipSync` used for compressed sizes. Decimal kB, not KiB.

| Asset                | Native bytes | Candidate bytes |       Increase |
| -------------------- | -----------: | --------------: | -------------: |
| JavaScript, minified |      462,118 |         521,342 | 59,224 (12.8%) |
| JavaScript, gzip     |      138,335 |         158,787 | 20,452 (14.8%) |
| CSS                  |       27,365 |          27,482 |            117 |
| CSS, gzip            |        6,423 |           6,443 |             20 |

The candidate also introduces Vite's 500 kB chunk warning. There is no demonstrated
new Settings interaction benefit to offset this cost, and the native wrapper
cannot be removed while the other two consumers still use it. Retaining native
Settings is preferable to adding coordination machinery simply to finish a
migration. Keyboard-operable context menus remain a separate, unapproved slice.

## Checks and evidence

Through the project devshell:

- Native baseline: frozen install, **503 tests**, typecheck, lint,
  format check and production build passed.
- Candidate: **505 tests**, typecheck, lint, format check and production build
  passed. Two extra unit tests cover candidate lifecycle/Escape/return focus and
  close-time replacement of a restoration target.
- Candidate `nix build --no-link .#default` passed after updating the dependency
  hash to `sha256-9LFNo8VPdkFu63DcQvhYHd7n6QcpzoixEiTR1QbdrZw=`. The original
  hash is restored with the original lockfile in the final tree. Existing
  revision/build-time injection was preserved.
- Final restored-native tree: frozen install, **503 tests**, typecheck, lint,
  format check, production build, the expanded browser runner and
  `nix build --no-link .#default` all passed. Final independent review found no
  blockers in the retained tests/receipts or production rollback.
- Paired expanded Chromium browser run: [native passed](evidence/settings-base-ui-2026-11-02/native.json),
  [candidate failed](evidence/settings-base-ui-2026-11-02/candidate.json) at the
  mixed-owner gate. Both recorded no page exceptions.
- The fixture uses StrictMode and a fresh synthetic Chromium profile. Network
  interception precedes navigation, blocks non-fixture origins and **all `/apps`
  requests, including GETs**, and verifies a blocked synthetic fulltext request.
  This matters because the normal local Vite `/apps` proxy reaches the real News
  server. No credentials, account writes or live extraction were used.
- Browser focus assertions wait two animation frames after input so library
  sentinels can redirect focus; the containment assertions remain intact.
- The separate article/table/CSS/toast browser suites were not rerun: no candidate
  is being accepted, and production source is restored. Unit tests cover their
  existing mocked behavior; that is not a claim of a complete browser audit.

The evidence snapshots were captured before committing the experiment, so their
version label is the baseline revision. They are receipts, not fixtures to be
rewritten when later behavior changes. Screenshots and detailed process logs
were produced under `/tmp/dripfeed-fox-pilot/` and `/tmp/pi-processes-*`; those are
scratch artifacts, not permanent storage.

## Rerun

Follow [tests/README.md](README.md) for Chromium selection. The normal dialog
runner now always executes all four mixed-owner cases; no opt-in flag is needed.
The final native tree must pass it. Running it at the rejected experiment is
expected to exit nonzero with the mixed-owner finding.

```sh
CHROMIUM_PATH=/path/to/chromium TEST_ARTIFACT_DIR=/tmp/settings-pilot \
  nix develop --command node tests/dialogs.browser.mjs
```
