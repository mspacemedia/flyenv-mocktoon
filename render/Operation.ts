export class Operation {
  running = false
  error = ''
  warning = ''
  log = ''
  private pending?: Promise<any>
  run<T>(work: (progress: (text: string) => void) => Promise<T>): Promise<T> {
    if (this.pending) return this.pending
    this.running = true
    this.error = this.warning = this.log = ''
    const pending = Promise.resolve()
      .then(() =>
        work((text) => {
          this.log = (this.log + text).slice(-64_000)
        })
      )
      .catch((error) => {
        this.error = error instanceof Error ? error.message : String(error)
        throw error
      })
      .finally(() => {
        this.running = false
        this.pending = undefined
      })
    this.pending = pending
    return pending
  }
}
