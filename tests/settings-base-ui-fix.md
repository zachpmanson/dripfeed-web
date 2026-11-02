# Settings Base UI pilot — ownership fixes

> This records the Settings-only stage at `aeca2a4`. The owner subsequently
> authorized the remaining dialogs, feed context menu and shared controls;
> see [base-ui-components.md](base-ui-components.md) for the completed follow-up.

2 November 2026, Melbourne. The owner explicitly requested **fixing the problems**
after the initial pilot was rejected. This supersedes the decision in
[the historical pilot receipt](settings-base-ui-pilot.md), not its recorded evidence.

## Implementation retained

Settings now uses pinned `@base-ui/react@1.9.0`. Add and Feed settings still use
the native wrapper; their controls, callbacks, API/state logic and appearance
are not migrated. Both wrappers share a small mounted-owner stack:

- Only the newest owner has active presentation, focus trapping and dismissal.
  Native dialogs suspend with `close()` and resume with `showModal()`; Base uses
  controlled `open` and `Portal keepMounted` while covered. No mixed top-layer
  competition, document-Escape interception workaround or z-index escalation.
- Covering a dialog does **not** call its parent's dismissal callback or recreate
  its form. Field nodes, entered values and the last focused control survive.
  Final parent unmount still removes the portal/forms; `keepMounted` does not
  retain credentials after the parent closes.
- One authority restores focus. Base's automatic final-focus restoration is
  disabled. The stack resolves explicit persistent targets at close time and
  checks live ownership before deferred restoration, including StrictMode replay,
  removed covered owners, rapid reset and same-commit replacement.
- Independent review caught a real replacement bug: replacing Settings with Add
  lost the outgoing opener after the old popup detached. Pending return-chain
  transfer fixes this; a dedicated unit test and actual browser replacements
  prevent recurrence. Feed settings' explicit persistent-row return target is
  retained when no underlying owner remains.

Only Settings adopts Base UI. No context-menu conversion, API/persistence change,
new confirmation UI, theme redesign or live-account validation is included.

## Verification

From source baseline `60d1c46`, through the project devshell:

- Frozen dependency install; **508 unit/component tests**; typecheck, lint,
  format check and production build pass.
- `nix build --no-link .#default` passes with the matching dependency-store hash.
  Revision/build-time injection is unchanged.
- Five real Chromium runners pass: dialogs, article tables, iframe footnotes,
  article CSS/sandbox resources and global error toast. See
  [per-run JSON evidence](evidence/settings-base-ui-fix-2026-11-02/).
- All four mixed opening orders now assert newest-owner focus, pointer
  hit-testing, accessibility-tree ownership and Tab/Shift-Tab containment
  **before and after Escape**, not just the remaining modal's text.
- Covered native credentials/Base editor nodes and values survive suspension;
  covered-owner removal in both directions, five genuine atomic replacements,
  three-owner LIFO dismissal and rapid cover removal preserve focus/state.
- Original ordinary naming, initial/returned focus, backdrop/drag, dynamic CSS
  editor/reset, credential reset, iframe pointer behavior and small-screen themes
  remain green. Scripted same-origin iframe focus remains diagnostic: both old
  native and Base variants permit it; this is not a new sandbox regression.
- Synthetic StrictMode fixtures only. Browser runners block non-fixture requests
  and `/apps` (including GETs) before Vite can proxy the real News server; the
  article resource probes are fulfilled locally. No account writes/extraction.
- Independent final review approved the pending-chain fix and current evidence.
  Historical JSON receipts are preserved unchanged; these new receipts were
  collected before committing, so their embedded version is the source baseline.

Agent metadata is ignored by Git. Tailwind scans only application source, not
agent artifacts or test receipts, keeping generated styles deterministic. Browser-driver installation is isolated under `/tmp`, not a project/runtime
dependency. Follow [README](README.md) for runner commands.

## Bundle trade-off, not a claimed speedup

The verified pre-commit eager build emits **523,013 bytes JS / 159,400 gzip**.
The native baseline emits **462,118 / 138,334**: an increase of **60,895 / 21,066
bytes**. The shared ownership fix adds a little to the original library cost;
it does not make that cost vanish. Vite still reports its 500 kB chunk warning.

No new Settings feature, measured speedup or screen-reader audit is claimed.
The library/ownership cost is disclosed rather than treated as permission to
abandon the requested migration. No lazy native-to-Base fallback was introduced:
remounting the shell during a cold load would add another focus/form transition.
Further code splitting can be evaluated separately with cold/warm-opening tests.
