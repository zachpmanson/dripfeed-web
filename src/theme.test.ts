import { describe, expect, it } from 'vitest'
import { sanitizeArticleCss } from './theme'

const resource = 'https://css-probe.invalid/probe'
const rejected = [
  `body { background: url("${resource}"); }`,
  `@import "${resource}";`,
  `@IMPORT url("${resource}");`,
  `body { background: image-set("${resource}" 1x); }`,
  `body { background: -webkit-image-set("${resource}" 1x); }`,
  `body { background: image("${resource}"); }`,
  `body { background: src("${resource}"); }`,
  `@font-face { font-family: probe; src: url("${resource}"); }`,
  String.raw`p { background: \69mage-set("${resource}" 1x); }`,
  `p { color: rgb(from url("${resource}") r g b); }`,
  `@supports (background: url("${resource}")) { p { color: red; } }`,
  `@media screen { p { background: url("${resource}"); } }`,
  'p { background: url(data:image/png;base64,a); }',
  '@namespace svg "https://example.com";',
  '@unknown { p { color: red; } }',
  'p { width: future-resource("probe"); }',
  'p { width: calc(1px + var(--size)); }',
  'p { color: env(color); }',
  `:root { --image: url("${resource}"); } p { background: var(--image); }`,
  'p { --size: 3px; width: var(--size); }',
  `p { background: linear-gradient(red, URL("${resource}")); }`,
  'p:unknown-function(a) { color: red; }',
  'p { color: red; nonsense }',
  'p { color: red',
  'p { font-family: "unterminated }',
  '/* unterminated',
  'p { color: red; } /*/',
  'p { font-family: "escaped final quote\\\\\\" }',
  'p { color: red; } }',
  'p { color: red; }\u0000',
  ...['', '/* ', "p::before { content: '"].map(
    (prefix) => `${prefix}</StYlE ><img id="css-breakout" src="${resource}"><style>`,
  ),
  'p::after { content: "</style>"; }',
  '/* </StYlE > */ p { color: red; }',
  // Escape decoding may itself produce a raw HTML delimiter on serialization.
  String.raw`p::after { content: "\3c /style>"; }`,
]
for (let digits = 1; digits <= 6; digits++) {
  // U+0075 and U+0069 need at least two hex digits; one-digit escapes are
  // covered by escaping the non-hex trailing letters with simple escapes.
  if (digits === 1) {
    rejected.push(String.raw`p { background: u\r\l("${resource}"); }`)
    rejected.push(String.raw`@i\mport "${resource}";`)
  } else {
    const u = '75'.padStart(digits, '0')
    const i = '69'.padStart(digits, '0')
    rejected.push(`p { background: \\${u}rl("${resource}"); }`)
    rejected.push(`@\\${i}mport "${resource}";`)
    rejected.push(`p { background: \\${u} rl("${resource}"); }`)
    rejected.push(`@\\${i} mport "${resource}";`)
  }
}
// Actual one-hex-digit escapes are control characters, not ASCII letters.
rejected.push(String.raw`p { background: \7 rl("${resource}"); }`)
rejected.push(String.raw`@\6 import "${resource}";`)

const accepted = [
  '',
  '/* Typography */ body { font-family: Georgia, "Times New Roman", serif; font-size: 19px; line-height: 1.7; max-width: 44rem; margin: 0 auto; } p { margin-bottom: 1.2em; } h1, h2 { font-weight: 600; letter-spacing: .02em; } a { color: #345678; text-decoration: underline; }',
  'p { color: rgb(12, 34, 56); width: calc(100% - 2rem); font-size: clamp(16px, 2vw, 24px); }',
  '@media (min-width: 30rem) { p { font-size: max(1em, 18px); } }',
  '@supports (display: grid) { p { display: grid; } }',
  'p:is(.a, .b):not(.c):nth-child(2n + 1) { color: hsl(120 50% 40%); }',
  'p::before { content: "日本語 café"; }',
  String.raw`p { color: r\67 b(12, 34, 56); }`,
  'p { color: color-mix(in srgb, red 50%, blue); }',
  'p::before { content: "url(probe) @import"; } /* url(probe) @import */',
  String.raw`.caf\e9 { color: RGB(12, 34, 56); }`,
  'p:lang(en):dir(ltr) { font-style: italic; }',
]

describe('sanitizeArticleCss', () => {
  it.each(rejected)('rejects the entire sheet: %s', (css) => {
    expect(sanitizeArticleCss(css)).toBe('')
    expect(sanitizeArticleCss(`p { color: red; } ${css} h1 { color: blue; }`)).toBe('')
  })
  it.each(accepted)('serializes supported CSS: %s', (css) => {
    const safe = sanitizeArticleCss(css)
    if (css) expect(safe).not.toBe('')
    expect(safe).not.toContain('<')
    expect(sanitizeArticleCss(safe)).toBe(safe)
  })
})
