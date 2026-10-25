/** The in-memory bell that wakes a pending wait_for_events. */
import type { EventSignal } from '@server/page-events/domain/ports/event-signal.port.ts';

export class MemorySignal implements EventSignal {
  private pending = new Map<string, Set<(why: 'event' | 'timeout') => void>>();

  ring(runId: string): void {
    for (const wake of this.pending.get(runId) ?? []) {
      wake('event');
    }
  }

  wait(runId: string, timeoutMs: number): Promise<'event' | 'timeout'> {
    return new Promise((resolve) => {
      const set = this.pending.get(runId) ?? new Set();
      this.pending.set(runId, set);
      const done = (why: 'event' | 'timeout') => {
        clearTimeout(timer);
        set.delete(done);
        if (!set.size) {
          this.pending.delete(runId);
        }
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
