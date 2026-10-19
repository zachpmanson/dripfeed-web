import { describe, expect, it } from 'vitest'
import { parsePositiveSafeInteger, parseUrlState, urlForState } from './urlState'

const invalidIds = [
  null,
  '',
  ' ',
  'NaN',
  'Infinity',
  '-Infinity',
  'nope',
  '0',
  '-0',
  '-1',
  '1.5',
  '0.5',
  '9007199254740992',
  '9007199254740993',
  '1e100',
]

describe('parsePositiveSafeInteger', () => {
  it.each(invalidIds)('rejects %j', (value) => {
    expect(parsePositiveSafeInteger(value)).toBeNull()
  })

  it.each([
    ['1', 1],
    ['42', 42],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['001', 1],
    ['1e2', 100],
    [' 2 ', 2],
  ])('accepts %s as %s', (value, expected) => {
    expect(parsePositiveSafeInteger(String(value))).toBe(expected)
  })
})

describe('parseUrlState', () => {
  for (const kind of ['feed', 'folder']) {
    it.each(invalidIds)(`${kind} %j falls back to all items`, (id) => {
      const params = new URLSearchParams({ view: kind, item: '7' })
      if (id !== null) params.set('id', id)
      expect(parseUrlState(params.toString())).toEqual({ view: { kind: 'all' }, selectedId: 7 })
    })
  }

  it.each(invalidIds)('item %j falls back to null without changing the view', (id) => {
    const params = new URLSearchParams({ view: 'feed', id: '8' })
    if (id !== null) params.set('item', id)
    expect(parseUrlState(params.toString())).toEqual({
      view: { kind: 'feed', id: 8 },
      selectedId: null,
    })
  })

  it.each(['all', 'allUnread', 'starred', 'feed', 'folder'])('accepts view %s', (kind) => {
    expect(parseUrlState(`?view=${kind}&id=9007199254740991&item=9007199254740991`)).toEqual({
      view: kind === 'feed' || kind === 'folder' ? { kind, id: Number.MAX_SAFE_INTEGER } : { kind },
      selectedId: Number.MAX_SAFE_INTEGER,
    })
  })

  it.each(['', '?view=unknown&id=1', '?id=1'])('defaults %s to all items', (search) => {
    expect(parseUrlState(search)).toEqual({ view: { kind: 'all' }, selectedId: null })
  })
})

describe('canonical URL', () => {
  it.each([
    ['?view=feed&id=NaN&item=1.5', '?view=all'],
    ['?view=folder&id=-1&item=7', '?view=all&item=7'],
    ['?view=feed&id=001&item=2e1', '?view=feed&id=1&item=20'],
    ['?view=all&id=1&item=', '?view=all'],
    ['?view=unknown', '?view=all'],
    ['', '?view=all'],
  ])('canonicalizes %s and is stable', (search, expected) => {
    const canonical = urlForState(`https://reader.test/reader${search}`, parseUrlState(search))
    expect(canonical).toBe(`/reader${expected}`)
    expect(urlForState(`https://reader.test${canonical}`, parseUrlState(expected))).toBe(canonical)
  })

  it('preserves unrelated repeated query parameters and the fragment', () => {
    const url = 'https://reader.test/reader?tag=a&view=feed&id=Infinity&tag=b&item=-1#article'
    expect(urlForState(url, parseUrlState(new URL(url).search))).toBe(
      '/reader?tag=a&view=all&tag=b#article',
    )
  })

  it('collapses duplicate navigation parameters', () => {
    const search = '?view=feed&view=folder&id=1&id=2&item=3&item=4'
    expect(urlForState(`https://reader.test/${search}`, parseUrlState(search))).toBe(
      '/?view=feed&id=1&item=3',
    )
  })
})
