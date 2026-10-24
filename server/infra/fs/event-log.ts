/**
 * `events.log`: one JSON line per page event, flushed before it is acted on.
 * `delivered.json`: the bookmark of what Claude has already been handed.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RecordedEvent, UnsequencedEvent } from '../../../shared/contract.ts';
import type { EventLog } from '../../kernel/ports.ts';
import { appendLine, readJson, writeAtomic } from './files.ts';

export class FsEventLog implements EventLog {
  /** Serialises appends per run so sequence numbers never collide. */
  private chains = new Map<string, Promise<unknown>>();

  constructor(private readonly folderOf: (runId: string) => Promise<string | undefined>) {}

  private async dir(runId: string): Promise<string> {
    const d = await this.folderOf(runId);
    if (!d) throw new Error(`no folder for run ${runId}`);
    return d;
  }

  private async all(runId: string): Promise<RecordedEvent[]> {
    try {
      const text = await readFile(join(await this.dir(runId), 'events.log'), 'utf8');
      return text.split('\n').filter(Boolean).flatMap((l) => {
        try { return [JSON.parse(l) as RecordedEvent]; } catch { return []; } // a torn last line from a crash
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  append(runId: string, event: UnsequencedEvent): Promise<number> {
    const prev = this.chains.get(runId) ?? Promise.resolve();
    const next = prev.then(async () => {
      const events = await this.all(runId);
      const seq = (events.at(-1)?.seq ?? 0) + 1;
      await appendLine(join(await this.dir(runId), 'events.log'), JSON.stringify({ ...event, seq }));
      return seq;
    });
    this.chains.set(runId, next.catch(() => undefined));
    return next;
  }

  async after(runId: string, seq: number): Promise<RecordedEvent[]> {
    return (await this.all(runId)).filter((e) => e.seq > seq);
  }

  async undelivered(runId: string): Promise<RecordedEvent[]> {
    const cursor = (await readJson<{ seq: number }>(join(await this.dir(runId), 'delivered.json')))?.seq ?? 0;
    return this.after(runId, cursor);
  }

  async markDelivered(runId: string, seq: number): Promise<void> {
    const file = join(await this.dir(runId), 'delivered.json');
    const cur = (await readJson<{ seq: number }>(file))?.seq ?? 0;
    if (seq > cur) await writeAtomic(file, JSON.stringify({ seq }));
  }
}
