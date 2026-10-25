/**
 * `events.log`: one JSON line per page event, flushed before it is acted on.
 * `delivered.json`: the bookmark of what Claude has already been handed.
 */
import { readFile, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import type { RecordedEvent, UnsequencedEvent } from '@shared/contract.ts';
import type { EventLog } from '@server/domain/ports.ts';
import { appendLine, isErrno, readJson, writeAtomic } from './files.ts';

/**
 * Appends are serialised by the caller: every change to a run, the append included, runs under
 * the run's lock (domain/unit-of-work). The last sequence number is read from the file on every
 * append, not cached, so it stays right even if another server ever appended to the same run.
 */
export class FsEventLog implements EventLog {
  constructor(private readonly folderOf: (runId: string) => Promise<string | undefined>) {}

  private async dir(runId: string): Promise<string> {
    const folder = await this.folderOf(runId);
    if (!folder) {
      throw new Error(`no folder for run ${runId}`);
    }
    return folder;
  }

  private async read(runId: string): Promise<string> {
    try {
      return await readFile(join(await this.dir(runId), 'events.log'), 'utf8');
    } catch (error) {
      if (isErrno(error, 'ENOENT')) {
        return '';
      }
      throw error;
    }
  }

  private async all(runId: string): Promise<RecordedEvent[]> {
    const lines = (await this.read(runId)).split('\n');
    // The text after the last newline is a line still being written, or torn by a crash.
    lines.pop();
    return lines.filter(Boolean).flatMap((line, index) => {
      try {
        const event: RecordedEvent = JSON.parse(line);
        return [event];
      } catch {
        console.error(`workbench: events.log of run ${runId}, line ${index + 1} is not valid JSON; skipped`);
        return [];
      }
    });
  }

  async append(runId: string, event: UnsequencedEvent): Promise<number> {
    const file = join(await this.dir(runId), 'events.log');
    const text = await this.read(runId);
    // A torn last line from a crash: cut it off, or the new line would be glued to it and lost.
    if (text && !text.endsWith('\n')) {
      await truncate(file, Buffer.byteLength(text.slice(0, text.lastIndexOf('\n') + 1)));
    }
    const seq = (await this.all(runId)).at(-1)?.seq ?? 0;
    await appendLine(file, JSON.stringify({ ...event, seq: seq + 1 }));
    return seq + 1;
  }

  async after(runId: string, seq: number): Promise<RecordedEvent[]> {
    return (await this.all(runId)).filter((event) => event.seq > seq);
  }

  async undelivered(runId: string): Promise<RecordedEvent[]> {
    const cursor = (await readJson<{ seq: number }>(join(await this.dir(runId), 'delivered.json')))?.seq ?? 0;
    return this.after(runId, cursor);
  }

  async markDelivered(runId: string, seq: number): Promise<void> {
    const file = join(await this.dir(runId), 'delivered.json');
    const cur = (await readJson<{ seq: number }>(file))?.seq ?? 0;
    if (seq > cur) {
      await writeAtomic(file, JSON.stringify({ seq }));
    }
  }
}
