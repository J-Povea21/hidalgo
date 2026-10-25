import { describe, expect, it } from 'vitest';
import type { LiveEntry } from '@shared/contract.ts';
import { T0 } from '@test/fixtures.ts';
import { newRun } from '@server/kernel/run.ts';
import { expired, isDead, liveEntry } from './live-index.ts';

const entry = (heartbeat: string): LiveEntry => ({
  runId: 'r1', project: 'MiPlan', skill: 'card', subject: 's', port: 1, pid: 42, processStartedAt: T0, heartbeat, pendingForUser: 0, url: '',
  status: 'open', ownerPid: 7, claudeListening: false,
});
const later = (ms: number) => new Date(Date.parse(T0) + ms).toISOString();

describe('live-index', () => {
  it('a stale heartbeat alone never declares a server dead', () => {
    expect(isDead(entry(T0), later(10 * 60_000), 120_000, () => true)).toBe(false);
  });

  it('dead takes both proofs: stale and the process gone', () => {
    expect(isDead(entry(T0), later(10 * 60_000), 120_000, () => false)).toBe(true);
    expect(isDead(entry(T0), later(30_000), 120_000, () => false)).toBe(false);
  });

  it('the entry carries what the switcher shows', () => {
    const run = newRun({ id: 'r1', skill: 'card', project: 'MiPlan', subject: 'validator', now: T0, threadId: 't1' });
    expect(liveEntry(run, { port: 51234, pid: 9, processStartedAt: T0, url: 'u', ownerPid: 7, claudeListening: true }, T0))
      .toMatchObject({ runId: 'r1', subject: 'validator', heartbeat: T0, pendingForUser: 0, status: 'open', ownerPid: 7, claudeListening: true });
  });

  it('only closed runs past retention expire; unfinished runs are kept', () => {
    const base = newRun({ id: 'r', skill: 'card', project: 'MiPlan', subject: 's', now: T0, threadId: 't' });
    const runs = [
      { ...base, id: 'old-closed', status: 'closed' as const, closedAt: T0 },
      { ...base, id: 'new-closed', status: 'closed' as const, closedAt: later(6 * 86_400_000) },
      { ...base, id: 'old-paused', status: 'paused' as const },
      { ...base, id: 'old-open' },
    ];
    expect(expired(runs, later(8 * 86_400_000), 7)).toEqual(['old-closed']);
  });
});
