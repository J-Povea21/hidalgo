/**
 * `live/<run id>.json`: one small file per running server, written only by it.
 * Reading the folder skips and deletes entries whose owner is provably dead:
 * a stale heartbeat AND a process that is gone, or reused by another program.
 */
import { execFileSync } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { LiveEntry } from '@shared/contract.ts';
import { isDead } from '@server/features/live-index/live-index.ts';
import type { Clock, LiveIndex } from '@server/kernel/ports.ts';
import { readJson, writeAtomic } from './files.ts';

const STALE_MS = 2 * 60 * 1000;

/** When the OS says a process started, or undefined if it isn't running. */
function processStart(pid: number): number | undefined {
  try {
    process.kill(pid, 0);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EPERM') return undefined;
  }
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const t = Date.parse(out);
    return Number.isNaN(t) ? Date.now() : t;
  } catch {
    return Date.now(); // alive but unreadable: never call it dead on that alone
  }
}

/** Alive means the pid runs AND it started when this entry says (± a few seconds): a reused pid doesn't count. */
export function processAlive(pid: number, startedAt: string): boolean {
  const started = processStart(pid);
  return started !== undefined && Math.abs(started - Date.parse(startedAt)) < 5000;
}

/** This process's own start time, in the same terms `processAlive` checks. */
export const ownStart = () => new Date(Math.floor((Date.now() - process.uptime() * 1000) / 1000) * 1000).toISOString();

export class FsLiveIndex implements LiveIndex {
  constructor(private readonly dir: string, private readonly clock: Clock, private readonly alive_ = processAlive) {}

  async write(entry: LiveEntry): Promise<void> {
    await writeAtomic(join(this.dir, `${entry.runId}.json`), JSON.stringify(entry));
  }

  async remove(runId: string): Promise<void> {
    await rm(join(this.dir, `${runId}.json`), { force: true });
  }

  async alive(): Promise<LiveEntry[]> {
    const out: LiveEntry[] = [];
    for (const name of await readdir(this.dir).catch(() => [] as string[])) {
      if (!name.endsWith('.json')) continue;
      const entry = await readJson<LiveEntry>(join(this.dir, name)).catch(() => undefined);
      if (!entry) continue;
      if (isDead(entry, this.clock.now(), STALE_MS, this.alive_)) await rm(join(this.dir, name), { force: true });
      else out.push(entry);
    }
    return out;
  }
}
