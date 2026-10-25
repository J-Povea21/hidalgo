/**
 * Claude Code's Stop hook for workbench: while this session has an open run
 * and nobody is waiting on it, ending the turn is blocked with the reason.
 *
 * "This session" is found without any session id: the hook (exec form) and
 * the workbench MCP server are both direct children of the same Claude Code
 * process, so a live entry belongs to us when its ownerPid is our parent.
 *
 * It blocks at most MAX_BLOCKS times in a row, so a session whose workbench
 * can't be reached is never trapped.
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isErrno } from '@server/common/infrastructure/fs/files.ts';
import { dataRoot } from '@server/common/infrastructure/paths.ts';
import type { LiveEntry } from '@shared/contract.ts';
import { RUN_STATUS } from '@shared/values.ts';

const MAX_BLOCKS = 3;

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrno(error, 'EPERM');
  }
}

export function openRunsNobodyWaitsOn(liveDir: string, ownerPid: number): LiveEntry[] {
  let names: string[] = [];
  try {
    names = readdirSync(liveDir).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
  const out: LiveEntry[] = [];
  for (const name of names) {
    try {
      const entry: LiveEntry & { awaiting?: boolean } = JSON.parse(readFileSync(join(liveDir, name), 'utf8'));
      // `awaiting` is the field's name before 0.6.0's rename; drop it once no older server can be running.
      const listening = entry.claudeListening ?? entry.awaiting;
      if (entry.ownerPid === ownerPid && entry.status === RUN_STATUS.open && !listening && pidAlive(entry.pid)) {
        out.push(entry);
      }
    } catch {
      // A torn or foreign file is not a reason to block anyone.
    }
  }
  return out;
}

function main(): void {
  readStdin();
  const owner = process.ppid;
  const counter = join(tmpdir(), `workbench-stop-${owner}.json`);
  const open = openRunsNobodyWaitsOn(join(dataRoot(), 'live'), owner);

  if (!open.length) {
    rmSync(counter, { force: true });
    return;
  }
  let count = 0;
  try {
    const saved: { count: number } = JSON.parse(readFileSync(counter, 'utf8'));
    count = saved.count;
  } catch {
    /* first time */
  }
  if (count >= MAX_BLOCKS) {
    rmSync(counter, { force: true });
    return;
  }
  writeFileSync(counter, JSON.stringify({ count: count + 1 }));
  const runs = open.map((entry) => `${entry.runId} (${entry.project}: ${entry.subject})`).join(', ');
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason:
        `A workbench run is open and nobody is listening to its page: ${runs}. ` +
        'Call wait_for_events for it so the user\'s next action reaches you, or close_session (status "paused" if items are left pending).',
    }),
  );
}

main();
