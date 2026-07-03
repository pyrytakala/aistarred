export class AdaptiveConcurrency {
  private capacity: number;
  private inFlight = 0;
  private pauseUntil = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly minimum: number,
    private readonly maximum: number,
    initial: number,
  ) {
    this.capacity = Math.max(minimum, Math.min(initial, maximum));
  }

  getCapacity(): number {
    return this.capacity;
  }

  private notify(): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      waiter();
    }
  }

  async acquire(): Promise<void> {
    while (true) {
      const now = performance.now();
      if (now < this.pauseUntil) {
        await sleep(Math.min(1000, this.pauseUntil - now));
        continue;
      }
      if (this.inFlight < this.capacity) {
        this.inFlight += 1;
        return;
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.notify();
  }

  penalize(retryAfter?: number | null): void {
    this.capacity = Math.max(this.minimum, Math.max(1, Math.floor(this.capacity / 2)));
    const pause = retryAfter ?? 2000;
    this.pauseUntil = Math.max(this.pauseUntil, performance.now() + pause);
    this.notify();
  }

  reward(): void {
    if (this.capacity < this.maximum) {
      this.capacity += 1;
    }
    this.notify();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
