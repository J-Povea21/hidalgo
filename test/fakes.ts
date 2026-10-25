/** In-memory fakes for every port: no disk, network or real clock in slice tests. */
import type { LiveEntry, RecordedEvent, RunState, UnsequencedEvent } from '@shared/contract.ts';
import type {
  Clock,
  EventLog,
  Ids,
  ImageStore,
  Limits,
  LiveIndex,
  PageAddress,
  PagePublisher,
  RunStore,
} from '@server/kernel/ports.ts';
import { MemoryRunLock, MemorySignal } from '@server/infra/runtime.ts';
import { addItems, ask, newRun } from '@server/kernel/run.ts';
import { card, counterIds, question, T0 } from './fixtures.ts';

export class MemoryStore implements RunStore {
  runs = new Map<string, RunState>();
  async load(id: string) {
    const run = this.runs.get(id);
    return run && structuredClone(run);
  }
  async save(run: RunState) {
    this.runs.set(run.id, structuredClone(run));
  }
  async list(project?: string) {
    return [...this.runs.values()].filter((run) => !project || run.project === project).reverse();
  }
  async remove(id: string) {
    this.runs.delete(id);
  }
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
  async undelivered(runId: string) {
    return this.after(runId, this.cursor.get(runId) ?? 0);
  }
  async after(runId: string, seq: number) {
    return (this.events.get(runId) ?? []).filter((event) => event.seq > seq);
  }
  async markDelivered(runId: string, seq: number) {
    this.cursor.set(runId, Math.max(seq, this.cursor.get(runId) ?? 0));
  }
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
  async usedBytes(runId: string) {
    return this.bytes.get(runId) ?? 0;
  }
  async path(runId: string, name: string) {
    return `/data/runs/${runId}/images/${name}`;
  }
}

export class CapturePage implements PagePublisher {
  shown: RunState[] = [];
  publish(run: RunState) {
    this.shown.push(structuredClone(run));
  }
  get last() {
    return this.shown.at(-1);
  }
}

export class MemoryLive implements LiveIndex {
  entries = new Map<string, LiveEntry>();
  async write(entry: LiveEntry) {
    this.entries.set(entry.runId, entry);
  }
  async remove(id: string) {
    this.entries.delete(id);
  }
  async alive() {
    return [...this.entries.values()];
  }
}

export const clock: Clock = { now: () => T0 };
export function ids(): Ids {
  const counters: Record<string, number> = {};
  return { next: (prefix) => `${prefix}${(counters[prefix] = (counters[prefix] ?? 0) + 1)}` };
}
export const address: PageAddress = { url: (runId) => `http://127.0.0.1:51234/#run=${runId}&t=secret` };
export const limits: Limits = { imageBytesPerRun: 1000, imageWarnBytes: 800, waitTimeoutMs: 200 };

export function world() {
  return {
    store: new MemoryStore(),
    log: new MemoryLog(),
    images: new MemoryImages(),
    signal: new MemorySignal(),
    lock: new MemoryRunLock(),
    page: new CapturePage(),
    live: new MemoryLive(),
    clock,
    ids: ids(),
    address,
    limits,
  };
}

/** A world holding run r1 with one card (i1) that has one open question. */
export async function seededWorld() {
  const fakes = world();
  const nextId = counterIds();
  let run = newRun({ id: 'r1', skill: 'card', project: 'MiPlan', subject: 'v', now: T0, threadId: nextId('t') });
  run = addItems(run, [{ kind: 'card', fields: card() }], nextId).run;
  run = ask(run, 'i1', [question()], nextId).run;
  await fakes.store.save(run);
  return { fakes, run, thread: run.items[0]!.threadId };
}
