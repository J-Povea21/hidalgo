/** Clock, ids, and the per-run lock. */
import { randomBytes } from 'node:crypto';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import type { RunLock } from '@server/common/ports/run-lock.port.ts';

/** One queue per run: each call runs after the previous one for that run settles. */
export class MemoryRunLock implements RunLock {
  private tails = new Map<string, Promise<unknown>>();

  exclusive<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(runId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.tails.set(runId, tail);
    void tail.then(() => {
      if (this.tails.get(runId) === tail) {
        this.tails.delete(runId);
      }
    });
    return next;
  }
}

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

/** Short random ids: unique enough within a machine's runs, short for Claude to read. */
export class RandomIds implements Ids {
  next(prefix: string): string {
    return `${prefix}${randomBytes(5).toString('base64url').replace(/[-_]/g, 'x')}`;
  }
}
