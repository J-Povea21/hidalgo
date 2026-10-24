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
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LiveEntry } from '../../../shared/contract.ts';

const MAX_BLOCKS = 3;

function readStdin(): string {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

export function openRunsNobodyWaitsOn(liveDir: string, ownerPid: number): LiveEntry[] {
  let names: string[] = [];
  try { names = readdirSync(liveDir).filter((n) => n.endsWith('.json')); } catch { return []; }
  const out: LiveEntry[] = [];
  for (const n of names) {
    try {
      const e = JSON.parse(readFileSync(join(liveDir, n), 'utf8')) as LiveEntry;
      if (e.ownerPid === ownerPid && e.status === 'open' && !e.awaiting && pidAlive(e.pid)) out.push(e);
    } catch {
      // A torn or foreign file is not a reason to block anyone.
    }
  }
  return out;
}

function main(): void {
  readStdin();
  const dataRoot = join(process.env['CLAUDE_PLUGIN_DATA'] ?? join(homedir(), '.claude', 'plugins', 'data', 'planeacion-tools'), 'workbench');
  const owner = process.ppid;
  const counter = join(tmpdir(), `workbench-stop-${owner}.json`);
  const open = openRunsNobodyWaitsOn(join(dataRoot, 'live'), owner);

  if (!open.length) {
    rmSync(counter, { force: true });
    return;
  }
  let count = 0;
  try { count = (JSON.parse(readFileSync(counter, 'utf8')) as { count: number }).count; } catch { /* first time */ }
  if (count >= MAX_BLOCKS) {
    rmSync(counter, { force: true });
    return;
  }
  writeFileSync(counter, JSON.stringify({ count: count + 1 }));
  const runs = open.map((e) => `${e.runId} (${e.project}: ${e.subject})`).join(', ');
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: `A workbench run is open and nobody is listening to its page: ${runs}. ` +
      'Call wait_for_events for it so the user\'s next action reaches you, or close_session (status "paused" if items are left pending).',
  }));
}

main();
