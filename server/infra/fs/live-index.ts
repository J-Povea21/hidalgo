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
import type { Clock } from '@server/domain/ports.ts';
import type { LiveIndex } from '@server/features/list-runs/ports.ts';
import { isErrno, readJson, writeAtomic } from './files.ts';

const STALE_MS = 2 * 60 * 1000;

/** How far apart two readings of one process's start time may be (they are rounded to the second). */
const SAME_START_MS = 5000;

/**
 * Whether a process is running, and when the OS says it started. The start time is unknown
 * where `ps` is missing (Windows) or fails; that is never a reason to call a process dead.
 */
type ProcessReading = { running: false } | { running: true; startedAt?: number };

function processStart(pid: number): ProcessReading {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (!isErrno(error, 'EPERM')) {
      return { running: false };
    }
  }
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const startedAt = Date.parse(out);
    return Number.isNaN(startedAt) ? { running: true } : { running: true, startedAt };
  } catch {
    return { running: true };
  }
}

/**
 * Alive means the pid runs AND, when its start time can be read, it started when this entry
 * says: a pid reused by another program doesn't count.
 */
export function processAlive(
  pid: number,
  startedAt: string,
  read: (pid: number) => ProcessReading = processStart,
): boolean {
  const found = read(pid);
  if (!found.running) {
    return false;
  }
  return found.startedAt === undefined || Math.abs(found.startedAt - Date.parse(startedAt)) < SAME_START_MS;
}

/** This process's own start time, in the same terms `processAlive` checks. */
export const ownStart = () => new Date(Math.floor((Date.now() - process.uptime() * 1000) / 1000) * 1000).toISOString();

export class FsLiveIndex implements LiveIndex {
  constructor(
    private readonly dir: string,
    private readonly clock: Clock,
    private readonly alive_ = processAlive,
  ) {}

  async write(entry: LiveEntry): Promise<void> {
    await writeAtomic(join(this.dir, `${entry.runId}.json`), JSON.stringify(entry));
  }

  async remove(runId: string): Promise<void> {
    await rm(join(this.dir, `${runId}.json`), { force: true });
  }

  async alive(): Promise<LiveEntry[]> {
    const out: LiveEntry[] = [];
    for (const name of await readdir(this.dir).catch((): string[] => [])) {
      if (!name.endsWith('.json')) {
        continue;
      }
      const entry = await readJson<LiveEntry>(join(this.dir, name)).catch(() => undefined);
      if (!entry) {
        continue;
      }
      if (isDead(entry, this.clock.now(), STALE_MS, this.alive_)) {
        await rm(join(this.dir, name), { force: true });
      } else {
        out.push(entry);
      }
    }
    return out;
  }
}
