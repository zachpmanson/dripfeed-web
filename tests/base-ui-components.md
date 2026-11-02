# Feed menu and ten Base UI conversions

2 November 2026, Melbourne. The owner authorized the feed context menu plus all
ten surfaces from the candidate inventory. This follows the
[Settings ownership fix](settings-base-ui-fix.md); its historical receipts remain
unchanged. Implementation baseline: `aeca2a4`.

## Completed scope

| Surface                                | Base UI primitive | Preserved contract                                                                                                                                 |
| -------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feed right-click menu and Move submenu | Context Menu      | Real row button, selection/aria-current, pointer and keyboard invocation, managed submenu, collision bounds, async actions/errors and API payloads |
| Add shell                              | Dialog            | Parent lifetime, URL/Name autofocus, busy submission and credentials                                                                               |
| Feed settings shell                    | Dialog            | Seeded toggle, optimistic rollback, persistent row return target                                                                                   |
| Add Feed/Folder buttons                | Tabs              | Keyboard selection, busy guard, Folder credential clearing and field focus                                                                         |
| Shared segmented choices               | Radio Group       | One mandatory original typed value, including `0` and `false`                                                                                      |
| Icon-button help                       | Tooltip           | Independent accessible label and native disabled button semantics                                                                                  |
| Folder disclosure                      | Collapsible       | Parent-controlled persistence, separate folder-selection button                                                                                    |
| Global error                           | Toast             | Existing external error/session/dedup state, one alert, persistent manual dismissal                                                                |
| Header show-mode picker                | Select            | Actual all/unread/priority values and explicit name                                                                                                |
| Add destination picker                 | Select            | Shared typed adapter, numeric IDs/zero-to-null, busy state and safe modal popup                                                                    |
| Three Settings preferences             | Checkbox          | Controlled booleans, labels, keyboard and label activation                                                                                         |

Unrelated auth/fulltext checkboxes and native rename/delete prompt/confirmation
remain unchanged. No API/persistence, article HTML/CSS/sandbox or authentication
policy changes; no responsive layout redesign or React/dependency upgrade.

## Lifecycle fixes, not just component substitutions

- Menu items have per-opening state, a synchronous duplicate-write lock and
  lifecycle-scoped clipboard promises/timer. A stale promise or old 700ms copied
  acknowledgement cannot dismiss or set errors on a reopened menu, even for a
  different feed.
- Menu-to-settings suppresses menu return focus before mounting the parent-owned
  dialog. Ordinary menu closure resolves the current row/fallback **after** DOM
  removal; opening-generation and dialog guards prevent stale focus jobs.
  Whole folder/panel removal is covered, not just row replacement inside settings.
- Both managed popups suppress the browser context menu and retain the old
  right-click-to-dismiss behavior.
- Disabled autofocus targets are skipped when busy Add resumes beneath a closed
  covering modal; its enabled close button/popup remains a usable focus target.
- The native Dialog is retained as an isolated regression probe, not an app
  consumer. Shared ownership tests continue to exercise native/Base coexistence.

Independent early reviews found the autofocus, internal right-click and detached
return-target defects. All three were fixed and given regression coverage; final
independent review found no remaining blocker.

## Parent verification

All commands used the project devshell:

- Frozen install; **525 tests / 33 files**, typecheck, lint, format check and
  production build passed independently after the writer handoff.
- All **seven browser runners** passed: dialogs, feed controls/menu, article
  tables, iframe footnotes, article CSS/resources, error toast and reconnect sync.
  Reconnect uses a managed local Vite server and a local fake API; all six of its
  cases passed, with no writes. The other six runner JSON receipts are retained
  [here](evidence/base-ui-components-2026-11-02/).
- `nix build --no-link .#default` passed with the unchanged dependency lock/hash.
- Synthetic StrictMode profiles only. Non-fixture requests and every `/apps`
  path, including extraction GETs, are blocked before Vite can proxy News.
  No live account credentials, writes or extraction validation.

The new browser suite checks actual typeahead focus, pointer/keyboard submenu
operation, outside-click consumption, duplicate/error/retry behavior, copied
feedback and stale lifetimes, settings handoff, grouped-menu removal, typed values,
Select popup Escape/covering, disabled/busy Add resume, Tooltip labels, checkbox
booleans, keyboard Tabs/auth clearing, and persistent replaced Toast beyond five
seconds. Existing modal focus/geometry, article security and error/session tests
remain green. Snapshot version labels are the pre-commit baseline, not a live
revision claim.

These are bounded synthetic tests, not touch/screen-reader certification. Menu
boxes fit tested 360/1000px viewports, both themes and larger root font without
adding overflow. The fixture's inherited narrow desktop-header overflow remains;
explicit four-corner item hit-testing and diagonal pointer travel are not claimed.

## Bundle cost

Final pre-commit devshell build: **697,340 bytes JS / 218,983 gzip** and
**28,402 bytes CSS / 6,622 gzip**. Previous Settings-only build was approximately
523,013 / 159,398 gzip JS: the additional primitives cost about **60 kB gzip**.
Vite's large-chunk warning remains. No speedup or cost-free adoption is claimed;
no speculative code splitting or redesign was bundled into the migration.
