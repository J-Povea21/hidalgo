/** In-memory fakes for every port: no disk, network or real clock in slice tests. */
import type { LiveEntry, RecordedEvent, RunState, UnsequencedEvent } from '../shared/contract.ts';
import type { Clock, EventLog, Ids, ImageStore, Limits, LiveIndex, PageAddress, PagePublisher, RunStore } from '../server/kernel/ports.ts';
import { MemoryRunLock, MemorySignal } from '../server/infra/runtime.ts';
import { T0 } from './fixtures.ts';

export class MemoryStore implements RunStore {
  runs = new Map<string, RunState>();
  async load(id: string) { const r = this.runs.get(id); return r && structuredClone(r); }
  async save(run: RunState) { this.runs.set(run.id, structuredClone(run)); }
  async list(project?: string) { return [...this.runs.values()].filter((r) => !project || r.project === project).reverse(); }
  async remove(id: string) { this.runs.delete(id); }
}

export class MemoryLog implements EventLog {
  events = new Map<string, RecordedEvent[]>();
  cursor = new Map<string, number>();
  async append(runId: string, ev: UnsequencedEvent) {
    const list = this.events.get(runId) ?? [];
    const seq = list.length + 1;
    list.push({ ...ev, seq } as RecordedEvent);
    this.events.set(runId, list);
    return seq;
  }
  async undelivered(runId: string) { return this.after(runId, this.cursor.get(runId) ?? 0); }
  async after(runId: string, seq: number) { return (this.events.get(runId) ?? []).filter((e) => e.seq > seq); }
  async markDelivered(runId: string, seq: number) { this.cursor.set(runId, Math.max(seq, this.cursor.get(runId) ?? 0)); }
}

export class MemoryImages implements ImageStore {
  bytes = new Map<string, number>();
  saved: string[] = [];
  async save(runId: string, url: string) {
    const name = `img${this.saved.length + 1}.webp`;
    this.saved.push(name);
    const decoded = Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4);
    this.bytes.set(runId, (this.bytes.get(runId) ?? 0) + decoded);
    return name;
  }
  async usedBytes(runId: string) { return this.bytes.get(runId) ?? 0; }
  path(runId: string, name: string) { return `/data/runs/${runId}/images/${name}`; }
}

export class CapturePage implements PagePublisher {
  shown: RunState[] = [];
  publish(run: RunState) { this.shown.push(structuredClone(run)); }
  get last() { return this.shown.at(-1); }
}

export class MemoryLive implements LiveIndex {
  entries = new Map<string, LiveEntry>();
  async write(e: LiveEntry) { this.entries.set(e.runId, e); }
  async remove(id: string) { this.entries.delete(id); }
  async alive() { return [...this.entries.values()]; }
}

export const clock: Clock = { now: () => T0 };
export function ids(): Ids {
  const n: Record<string, number> = {};
  return { next: (p) => `${p}${(n[p] = (n[p] ?? 0) + 1)}` };
}
export const address: PageAddress = { url: (runId) => `http://127.0.0.1:51234/#run=${runId}&t=secret` };
export const limits: Limits = { imageBytesPerRun: 1000, imageWarnBytes: 800, waitTimeoutMs: 200 };

export function world() {
  return {
    store: new MemoryStore(), log: new MemoryLog(), images: new MemoryImages(), signal: new MemorySignal(), lock: new MemoryRunLock(),
    page: new CapturePage(), live: new MemoryLive(), clock, ids: ids(), address, limits,
  };
}
