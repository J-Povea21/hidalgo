/**
 * The "Open reviews" list and disk housekeeping.
 *
 * `liveEntry` is what each running server writes every heartbeat (the whole
 * entry, so a mistakenly deleted one comes back within a beat). `expired`
 * picks finished runs past retention; unfinished runs are never removed here.
 */
import type { LiveEntry, RunState } from '@shared/contract.ts';
import { pendingForUser } from '@shared/rules.ts';

export function liveEntry(
  run: RunState,
  server: {
    port: number;
    pid: number;
    processStartedAt: string;
    url: string;
    ownerPid: number;
    claudeListening: boolean;
  },
  now: string,
): LiveEntry {
  return {
    status: run.status,
    ownerPid: server.ownerPid,
    claudeListening: server.claudeListening,
    runId: run.id,
    project: run.project,
    skill: run.skill,
    subject: run.subject,
    port: server.port,
    pid: server.pid,
    processStartedAt: server.processStartedAt,
    heartbeat: now,
    pendingForUser: pendingForUser(run),
    url: server.url,
  };
}

const DAY = 24 * 60 * 60 * 1000;

/** Closed runs older than the retention window. Paused or open runs are kept: the user decides those. */
export function expired(runs: RunState[], now: string, retentionDays: number): string[] {
  const cutoff = Date.parse(now) - retentionDays * DAY;
  return runs
    .filter((run) => run.status === 'closed' && run.closedAt && Date.parse(run.closedAt) < cutoff)
    .map((run) => run.id);
}

/**
 * Whether an entry's owner is dead. Takes two proofs: a stale heartbeat and a
 * process the OS says is gone (or reused by a different process).
 */
export function isDead(
  entry: LiveEntry,
  now: string,
  staleMs: number,
  processAlive: (pid: number, startedAt: string) => boolean,
): boolean {
  const stale = Date.parse(now) - Date.parse(entry.heartbeat) > staleMs;
  return stale && !processAlive(entry.pid, entry.processStartedAt);
}
