/** Pushes each run's state to its open pages over SSE. Implements PagePublisher. */
import type { RunState } from '../../../shared/contract.ts';
import type { PagePublisher } from '../../kernel/ports.ts';

export type PageMessage =
  | { type: 'state'; state: RunState }
  | { type: 'goodbye'; reason: string }
  /** A short notice for pages already open, e.g. "Claude resumed this run". */
  | { type: 'nudge'; text: string };

type Listener = (msg: PageMessage) => void;

export class PageHub implements PagePublisher {
  private listeners = new Map<string, Set<Listener>>();
  private latest = new Map<string, RunState>();

  publish(run: RunState): void {
    this.latest.set(run.id, run);
    for (const l of this.listeners.get(run.id) ?? []) l({ type: 'state', state: run });
  }

  current(runId: string): RunState | undefined {
    return this.latest.get(runId);
  }

  subscribe(runId: string, l: Listener): () => void {
    const set = this.listeners.get(runId) ?? new Set();
    set.add(l);
    this.listeners.set(runId, set);
    const now = this.latest.get(runId);
    if (now) l({ type: 'state', state: now });
    return () => set.delete(l);
  }

  /** Pages connected to the run right now. A closed tab or a sleeping laptop drops out on the next keep-alive. */
  viewers(runId: string): number {
    return this.listeners.get(runId)?.size ?? 0;
  }

  nudge(runId: string, text: string): void {
    for (const l of this.listeners.get(runId) ?? []) l({ type: 'nudge', text });
  }

  /** The session is ending normally: tell every open page before the server exits. */
  goodbye(reason: string): void {
    for (const set of this.listeners.values()) for (const l of set) l({ type: 'goodbye', reason });
  }
}
