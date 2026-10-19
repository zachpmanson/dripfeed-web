import { describe, expect, it, vi } from 'vitest'
import { SerialOptimisticMutation } from './optimisticMutation'

describe('SerialOptimisticMutation', () => {
  it('stays active until every queued send and rollback settles', async () => {
    const mutation = new SerialOptimisticMutation(false)
    let resolveFirst!: () => void
    const firstRequest = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    let rejectSecond!: (error: Error) => void
    const secondRequest = new Promise<void>((_, reject) => {
      rejectSecond = reject
    })
    let finishRollback!: () => void
    const rollback = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRollback = resolve
        }),
    )

    expect(mutation.isIdle).toBe(true)
    const first = mutation.enqueue(true, () => firstRequest, rollback)
    const second = mutation.enqueue(false, () => secondRequest, rollback)
    const secondResult = expect(second).rejects.toThrow('request failed')
    expect(mutation.isIdle).toBe(false)

    resolveFirst()
    await first
    expect(mutation.isIdle).toBe(false)
    rejectSecond(new Error('request failed'))
    await vi.waitFor(() => expect(rollback).toHaveBeenCalledWith(true))
    expect(mutation.isIdle).toBe(false)
    finishRollback()
    await secondResult
    expect(mutation.isIdle).toBe(true)
  })

  it('becomes idle even when rollback throws', async () => {
    const mutation = new SerialOptimisticMutation(false)
    await expect(
      mutation.enqueue(
        true,
        async () => {
          throw new Error('send failed')
        },
        async () => {
          throw new Error('rollback failed')
        },
      ),
    ).rejects.toThrow('rollback failed')
    expect(mutation.isIdle).toBe(true)
  })

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
