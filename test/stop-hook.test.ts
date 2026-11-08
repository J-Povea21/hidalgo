/**
 * The built Stop hook, run the way Claude Code runs it: as a direct child of
 * the process that owns the session. A parent process writes a live entry
 * naming itself as owner, then runs the hook.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const hook = resolve(__dirname, '..', 'dist', 'stop-hook.mjs');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Runs the hook N times from one parent; returns what each run printed. */
function asOwner(entry: { status: string; claudeListening: boolean; owner: 'self' | 'other' }, runs = 1): string[] {
  const data = mkdtempSync(join(tmpdir(), 'wb-hook-'));
  dirs.push(data);
  const parent = `
    const { mkdirSync, writeFileSync } = require('node:fs');
    const { execFileSync } = require('node:child_process');
    const live = ${JSON.stringify(join(data, 'hidalgo', 'live'))};
    mkdirSync(live, { recursive: true });
    writeFileSync(live + '/r1.json', JSON.stringify({
      runId: 'r1', project: 'Storefront', skill: 'card', subject: 'validator', port: 1, pid: process.pid,
      processStartedAt: '', heartbeat: new Date().toISOString(), pendingForUser: 1, url: '',
      status: ${JSON.stringify(entry.status)}, claudeListening: ${entry.claudeListening},
      ownerPid: ${entry.owner === 'self' ? 'process.pid' : '1'},
    }));
    const out = [];
    for (let i = 0; i < ${runs}; i++) out.push(execFileSync(process.execPath, [${JSON.stringify(hook)}], { input: '{}', env: { ...process.env, CLAUDE_PLUGIN_DATA: ${JSON.stringify(data)} }, encoding: 'utf8' }));
    process.stdout.write(JSON.stringify(out));
  `;
  return JSON.parse(execFileSync(process.execPath, ['-e', parent], { encoding: 'utf8' }));
}

describe('stop hook', () => {
  it("blocks ending the turn while this session's run is open and nobody waits on it", () => {
    const [out] = asOwner({ status: 'open', claudeListening: false, owner: 'self' });
    expect(JSON.parse(out!)).toMatchObject({ decision: 'block' });
    expect(JSON.parse(out!).reason).toContain('wait_for_events');
  });

  it('allows it while a wait is pending', () => {
    expect(asOwner({ status: 'open', claudeListening: true, owner: 'self' })).toEqual(['']);
  });

  it('allows it once the run is paused or closed', () => {
    expect(asOwner({ status: 'paused', claudeListening: false, owner: 'self' })).toEqual(['']);
  });

  it("ignores another session's runs", () => {
    expect(asOwner({ status: 'open', claudeListening: false, owner: 'other' })).toEqual(['']);
  });

  it('blocks at most three times in a row, so a session is never trapped', () => {
    const outs = asOwner({ status: 'open', claudeListening: false, owner: 'self' }, 4);
    expect(outs.map((out) => (out ? JSON.parse(out).decision : 'allow'))).toEqual(['block', 'block', 'block', 'allow']);
  });
});
