export class BoundedJobQueue {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Job queue concurrency must be at least 1.');
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }

  status() {
    return { active: this.active, waiting: this.waiters.length, concurrency: this.concurrency };
  }
}

export const mediaJobQueue = new BoundedJobQueue(2);
