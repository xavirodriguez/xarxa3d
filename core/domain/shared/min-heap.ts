export class MinHeap<T> {
  private readonly items: { value: T; priority: number }[] = []

  get size(): number {
    return this.items.length
  }

  push(value: T, priority: number): void {
    this.items.push({ value, priority })
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.items[parent].priority <= this.items[i].priority) break
      ;[this.items[parent], this.items[i]] = [this.items[i], this.items[parent]]
      i = parent
    }
  }

  pop(): { value: T; priority: number } | undefined {
    if (this.items.length === 0) return undefined
    const top = this.items[0]
    const last = this.items.pop()!
    if (this.items.length > 0) {
      this.items[0] = last
      let i = 0
      const n = this.items.length
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let smallest = i
        if (l < n && this.items[l].priority < this.items[smallest].priority) smallest = l
        if (r < n && this.items[r].priority < this.items[smallest].priority) smallest = r
        if (smallest === i) break
        ;[this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]]
        i = smallest
      }
    }
    return top
  }
}
