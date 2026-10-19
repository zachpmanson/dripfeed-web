export class SerialOptimisticMutation<T> {
  private confirmed: T
  private tail: Promise<void> = Promise.resolve()
  private revision = 0
  private pending = 0

  constructor(initialValue: T) {
    this.confirmed = initialValue
  }

  get isIdle(): boolean {
    return this.pending === 0
  }

  enqueue(
    next: T,
    send: () => Promise<void>,
    rollback: (confirmed: T) => Promise<void>,
  ): Promise<void> {
    const revision = ++this.revision
    this.pending++
    const operation = this.tail.then(async () => {
      try {
        await send()
        this.confirmed = next
      } catch (error) {
        if (revision === this.revision) await rollback(this.confirmed)
        throw error
      } finally {
        this.pending--
      }
    })
    this.tail = operation.catch(() => {})
    return operation
  }
}
