import { describe, expect, it, vi } from 'vitest'
import { SerialOptimisticMutation } from './optimisticMutation'

describe('SerialOptimisticMutation', () => {
  it('serializes writes and does not let an older failure roll back newer intent', async () => {
    const mutation = new SerialOptimisticMutation(false)
    let resolveFirst!: () => void
    const firstRequest = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    const sendFirst = vi.fn(() => firstRequest)
    const sendSecond = vi.fn(async () => {})
    const rollback = vi.fn(async () => {})

    const first = mutation.enqueue(true, sendFirst, rollback)
    const second = mutation.enqueue(false, sendSecond, rollback)
    await Promise.resolve()
    expect(sendFirst).toHaveBeenCalledOnce()
    expect(sendSecond).not.toHaveBeenCalled()

    resolveFirst()
    await Promise.all([first, second])

    expect(sendSecond).toHaveBeenCalledOnce()
    expect(rollback).not.toHaveBeenCalled()
  })

  it('rolls the latest failed write back to the last confirmed value', async () => {
    const mutation = new SerialOptimisticMutation(false)
    const rollback = vi.fn(async () => {})
    const first = vi.fn(async () => {})
    const second = vi.fn(async () => {
      throw new Error('request failed')
    })

    await mutation.enqueue(true, first, rollback)
    await expect(mutation.enqueue(false, second, rollback)).rejects.toThrow('request failed')

    expect(rollback).toHaveBeenCalledOnce()
    expect(rollback).toHaveBeenCalledWith(true)
  })

  it('restores the original confirmed value when all queued writes fail', async () => {
    const mutation = new SerialOptimisticMutation(false)
    const rollback = vi.fn(async () => {})
    const fail = vi.fn(async () => {
      throw new Error('request failed')
    })

    const first = mutation.enqueue(true, fail, rollback)
    const second = mutation.enqueue(false, fail, rollback)
    await expect(first).rejects.toThrow('request failed')
    await expect(second).rejects.toThrow('request failed')

    expect(rollback).toHaveBeenCalledOnce()
    expect(rollback).toHaveBeenCalledWith(false)
  })
})
