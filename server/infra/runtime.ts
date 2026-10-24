/** Clock, ids and the in-memory bell that wakes a pending wait_for_events. */
import { randomBytes } from 'node:crypto';
import type { Clock, EventSignal, Ids } from '../kernel/ports.ts';

export const systemClock: Clock = { now: () => new Date().toISOString() };

/** Short random ids: unique enough within a machine's runs, short for Claude to read. */
export const randomIds: Ids = { next: (prefix) => `${prefix}${randomBytes(5).toString('base64url').replace(/[-_]/g, 'x')}` };

export class MemorySignal implements EventSignal {
  private pending = new Map<string, Set<(why: 'event' | 'timeout') => void>>();

  ring(runId: string): void {
    for (const wake of this.pending.get(runId) ?? []) wake('event');
  }

  wait(runId: string, timeoutMs: number): Promise<'event' | 'timeout'> {
    return new Promise((resolve) => {
      const set = this.pending.get(runId) ?? new Set();
      this.pending.set(runId, set);
      const done = (why: 'event' | 'timeout') => {
        clearTimeout(timer);
        set.delete(done);
        if (!set.size) this.pending.delete(runId);
        resolve(why);
      };
      const timer = setTimeout(() => done('timeout'), timeoutMs);
      set.add(done);
    });
  }

  waiting(runId: string): boolean {
    return (this.pending.get(runId)?.size ?? 0) > 0;
  }
}
