export class SerialOptimisticMutation<T> {
  private confirmed: T
  private tail: Promise<void> = Promise.resolve()
  private revision = 0

  constructor(initialValue: T) {
    this.confirmed = initialValue
  }

  enqueue(
    next: T,
    send: () => Promise<void>,
    rollback: (confirmed: T) => Promise<void>,
  ): Promise<void> {
    const revision = ++this.revision
    const operation = this.tail.then(async () => {
      try {
        await send()
        this.confirmed = next
      } catch (error) {
        if (revision === this.revision) await rollback(this.confirmed)
        throw error
      }
    })
    this.tail = operation.catch(() => {})
    return operation
  }
}
