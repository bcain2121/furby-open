export class InteractionQueue<Key> {
  private readonly tails = new Map<Key, Promise<void>>();

  async run<T>(key: Key, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => current);
    this.tails.set(key, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  async waitForIdle(predicate: (key: Key) => boolean = () => true) {
    while (true) {
      const pending = [...this.tails.entries()].filter(([key]) => predicate(key));
      if (pending.length === 0) return;
      await Promise.all(pending.map(([, tail]) => tail.catch(() => undefined)));
      if (![...this.tails.keys()].some(predicate)) return;
    }
  }

  pendingKeys() {
    return this.tails.size;
  }
}
