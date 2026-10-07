# Agent notes

## Frontend style

Keep changes consistent with the existing Vite + React + TypeScript app. The
Chainmail frontend guide is a useful source for component and state conventions,
but its Tailwind-specific rules do not apply here: this project uses regular CSS
in `src/index.css`.

### Styling

- Keep component styles in `src/index.css`; use the existing class names and
  layout rather than introducing a styling framework or one-off styling system.
- Use the CSS custom properties for app surfaces, text, borders, and accents.
  Add theme-dependent values to both the root and light-theme blocks.
- Keep app chrome styling separate from article content. User-provided article
  CSS and rendered feed HTML have their own behavior; avoid broad selectors that
  unintentionally affect them.
- Prefer semantic class names and existing component patterns. Avoid inline
  style objects for static presentation; use them when values are genuinely
  dynamic.
- Preserve keyboard focus, accessible labels, and usable target sizes for
  interactive controls. Reuse existing components such as `IconButton` where
  appropriate.

### Components and state

- Keep components focused and group them by feature under
  `src/components/{app,feed,items,reader,settings,ui}/`. Extract reusable logic
  into `src/hooks.ts` or focused modules when it clarifies the component.
- Use inline prop types for component-local props; introduce named types when
  shared or when they describe a meaningful domain shape.
- Keep server/API access in `src/api/`; keep persistence and database operations
  in the existing data modules. Components should not duplicate API or IndexedDB
  mechanics.
- Use React state for local UI state. Keep durable user preferences in the
  existing settings/persistence flow, and use the URL only for state that should
  be linkable or participate in browser navigation.
- Prefer pure functions for sorting, selectors, parsing, and other logic that
  can be tested independently.

### Comments and verification

- Comments should explain a non-obvious constraint, invariant, or gotcha—not
  restate the code.
- Before finishing, run the narrowest relevant check. Available project checks
  include `pnpm typecheck` and `pnpm build` (or their Makefile equivalents).
  There is currently no test or lint script in `package.json`; don't claim either
  was run unless one is added.
