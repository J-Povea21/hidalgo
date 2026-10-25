/** Pushes each run's state to its open pages over SSE. Implements PagePublisher. */
import { STREAM_EVENT } from '@shared/constants.ts';
import type { RunState } from '@shared/contract.ts';
import type { PagePublisher } from '@server/kernel/ports.ts';

export type PageMessage =
  | { type: typeof STREAM_EVENT.state; state: RunState }
  | { type: typeof STREAM_EVENT.goodbye; reason: string }
  | { type: typeof STREAM_EVENT.nudge; text: string };

type Listener = (msg: PageMessage) => void;

export class PageHub implements PagePublisher {
  private listeners = new Map<string, Set<Listener>>();
  private latest = new Map<string, RunState>();
  private arrivals = new Map<string, Set<() => void>>();
  /** Told whenever a page connects to a run. */
  onViewer?: (runId: string) => void;

  publish(run: RunState): void {
    this.latest.set(run.id, run);
    for (const listener of this.listeners.get(run.id) ?? []) {
      listener({ type: STREAM_EVENT.state, state: run });
    }
  }

  current(runId: string): RunState | undefined {
    return this.latest.get(runId);
  }

  subscribe(runId: string, listener: Listener): () => void {
    const set = this.listeners.get(runId) ?? new Set();
    set.add(listener);
    this.listeners.set(runId, set);
    const now = this.latest.get(runId);
    if (now) {
      listener({ type: STREAM_EVENT.state, state: now });
    }
    this.onViewer?.(runId);
    for (const arrived of this.arrivals.get(runId) ?? []) {
      arrived();
    }
    return () => set.delete(listener);
  }

  /** Resolves true as soon as a page connects to the run, false if none does within `ms`. */
  waitForViewer(runId: string, ms: number): Promise<boolean> {
    if (this.viewers(runId) > 0) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const set = this.arrivals.get(runId) ?? new Set();
      this.arrivals.set(runId, set);
      const done = (seen: boolean) => {
        clearTimeout(timer);
        set.delete(arrived);
        resolve(seen);
      };
      const arrived = () => done(true);
      const timer = setTimeout(() => done(false), ms);
      set.add(arrived);
    });
  }

  /** Pages connected to the run right now. A closed tab or a sleeping laptop drops out on the next keep-alive. */
  viewers(runId: string): number {
    return this.listeners.get(runId)?.size ?? 0;
  }

  nudge(runId: string, text: string): void {
    for (const listener of this.listeners.get(runId) ?? []) {
      listener({ type: STREAM_EVENT.nudge, text });
    }
  }

  /** The session is ending normally: tell every open page before the server exits. */
  goodbye(reason: string): void {
    for (const set of this.listeners.values()) {
      for (const listener of set) {
        listener({ type: STREAM_EVENT.goodbye, reason });
      }
    }
  }
}
