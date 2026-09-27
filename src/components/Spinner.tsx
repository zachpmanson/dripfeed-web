/**
 * The loading indicator: the drawn ↻, turning once every 0.8s.
 *
 * One mark for every wait in the app — full-article extraction, manual
 * refresh, load-more/paging, and the sync gate's connecting state — so the act
 * reads the same wherever it happens. The same mark and the same turn as
 * chainmail's (its .spinner in src/styles.css).
 *
 * Drawn, not typeset, and that is the whole of the wobble fix: a transform
 * turns about the box centre, and a character's ink is not centred in its em
 * box — DejaVu Sans' ↻ ink centre sits 0.097em above the box centre — so a
 * typeset ↻ orbits its axis instead of turning on it. The path is drawn to the
 * centre, so the turn is exact on every font, browser and size.
 *
 * The box is the stylesheet's 1em square (see .spinner), so the mark takes the
 * size of the line it sits in.
 */
export function Spinner() {
  return (
    <svg className="spinner" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M11.955 4.547A5.25 5.25 0 1 1 8 2.75M11.581 2.75L13.007 5.752L10.225 3.934"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
