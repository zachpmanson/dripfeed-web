import { describe, expect, it } from 'vitest'
import { serverTimeFrom } from './sync'

describe('serverTimeFrom', () => {
  it('reads the server Date as UNIX seconds', () => {
    expect(serverTimeFrom(new Headers({ Date: 'Thu, 01 Jan 1970 00:01:40 GMT' }))).toBe(100)
  })

  it('returns null when Date is missing or not exposed by CORS', () => {
    expect(serverTimeFrom(new Headers())).toBeNull()
  })

  it('returns null for an invalid Date rather than substituting browser time', () => {
    expect(serverTimeFrom(new Headers({ Date: 'invalid' }))).toBeNull()
  })
})
