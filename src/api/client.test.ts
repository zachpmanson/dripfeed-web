import { describe, expect, it } from 'vitest'
import { RateLimitCooldown } from './client'

describe('RateLimitCooldown', () => {
  it('keeps cooldowns isolated by origin', () => {
    const cooldown = new RateLimitCooldown()

    cooldown.extend('https://one.example', 60_000, 1_000)

    expect(cooldown.remaining('https://one.example', 2_000)).toBe(59_000)
    expect(cooldown.remaining('https://two.example', 2_000)).toBe(0)
  })

  it('extends a cooldown without shortening an existing one', () => {
    const cooldown = new RateLimitCooldown()

    cooldown.extend('https://one.example', 60_000, 1_000)
    cooldown.extend('https://one.example', 10_000, 2_000)

    expect(cooldown.remaining('https://one.example', 2_000)).toBe(59_000)
  })

  it('clears expired cooldowns', () => {
    const cooldown = new RateLimitCooldown()

    cooldown.extend('https://one.example', 1_000, 1_000)

    expect(cooldown.remaining('https://one.example', 2_000)).toBe(0)
    expect(cooldown.remaining('https://one.example', 1_000)).toBe(0)
  })
})
