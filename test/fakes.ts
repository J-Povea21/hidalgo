/** In-memory fakes for every port: no disk, network or real clock in use-case tests. */
import type { LiveEntry, RecordedEvent, RunState, UnsequencedEvent } from '@shared/contract.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { EventLog } from '@server/common/ports/event-log.port.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import type { ImageStore } from '@server/page-events/domain/ports/image-store.port.ts';
import type { Limits } from '@server/page-events/domain/limits.ts';
import type { PagePublisher } from '@server/common/ports/page-publisher.port.ts';
import type { RunStore } from '@server/common/ports/run-store.port.ts';
import type { LiveIndex } from '@server/runs/domain/ports/live-index.port.ts';
import { buildModules, type Adapters, type Modules } from '@server/app/modules.ts';
import { MemoryRunLock } from '@server/common/infrastructure/runtime.ts';
import { MemorySignal } from '@server/page-events/infrastructure/memory-signal.ts';
import { sequenced } from '@server/common/domain/events.ts';
import { addItems, ask, newRun } from '@server/common/domain/run.ts';
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
    list.push(sequenced(ev, seq));
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

export class FixedClock implements Clock {
  now(): string {
    return T0;
  }
}

/** Counts per prefix: r1, t1, t2, m1, ... */
export class CountingIds implements Ids {
  private counters: Record<string, number> = {};
  next(prefix: string): string {
    this.counters[prefix] = (this.counters[prefix] ?? 0) + 1;
    return `${prefix}${this.counters[prefix]}`;
  }
}

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
    clock: new FixedClock(),
    ids: new CountingIds(),
    limits,
  };
}

/** The use cases, wired to the given fakes exactly as the server wires them to its adapters. */
export function useCases(fakes: Adapters): Modules {
  return buildModules(fakes);
}

/** A world holding run r1 with one card (i1) that has one open question. */
export async function seededWorld() {
  const fakes = world();
  const nextId = counterIds();
  let run = newRun({ id: 'r1', skill: 'card', project: 'MiPlan', subject: 'v', now: T0, threadId: nextId('t') });
  run = addItems(run, [{ kind: 'card', fields: card() }], nextId).run;
  run = ask(run, 'i1', [question()], nextId).run;
  await fakes.store.save(run);
  return { fakes, cases: useCases(fakes), run, thread: run.items[0]!.threadId };
}
