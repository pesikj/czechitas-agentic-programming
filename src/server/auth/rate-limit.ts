// In-memory fixed-window rate limiting. Counts reset when the app restarts, which is acceptable
// for a single server (see docs/decisions.md); a shared store would be needed for several instances.

export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records an attempt; returns false when the key is over its limit. */
  hit(key: string): boolean {
    const time = this.now();
    const window = this.windows.get(key);
    if (!window || time - window.start >= this.windowMs) {
      this.windows.set(key, { start: time, count: 1 });
      this.prune(time);
      return true;
    }
    window.count++;
    return window.count <= this.limit;
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  private prune(time: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) {
      if (time - window.start >= this.windowMs) this.windows.delete(key);
    }
  }
}

const MINUTE = 60_000;

export const signInByAccount = new RateLimiter(10, 15 * MINUTE);
export const signInByAddress = new RateLimiter(50, 15 * MINUTE);
export const resetByAccount = new RateLimiter(3, 60 * MINUTE);
export const resetByAddress = new RateLimiter(20, 60 * MINUTE);
