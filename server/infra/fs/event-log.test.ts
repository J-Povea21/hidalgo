import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FsEventLog } from './event-log.ts';

const at = '2026-10-24T22:00:00.000Z';
let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function log() {
  dir = mkdtempSync(join(tmpdir(), 'wb-log-'));
  return new FsEventLog(async () => dir);
}

describe('event log', () => {
  it('numbers events in order and hands back the ones after a seq', async () => {
    const l = log();
    expect(await l.append('r', { type: 'diagram-failed', diagramId: 'd', error: 'x', at })).toBe(1);
    expect(await l.append('r', { type: 'diagram-failed', diagramId: 'e', error: 'y', at })).toBe(2);
    expect((await l.after('r', 1)).map((e) => e.seq)).toEqual([2]);
  });

  it('a line torn by a crash is cut off, so the next event is not glued to it and lost', async () => {
    const l = log();
    await l.append('r', { type: 'diagram-failed', diagramId: 'd', error: 'x', at });
    appendFileSync(join(dir, 'events.log'), '{"type":"verdict","ite');
    expect(await l.append('r', { type: 'diagram-failed', diagramId: 'e', error: 'y', at })).toBe(2);
    expect((await l.after('r', 0)).map((e) => e.seq)).toEqual([1, 2]);
    expect(readFileSync(join(dir, 'events.log'), 'utf8').split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('says which line it skipped instead of dropping it silently', async () => {
    const l = log();
    appendFileSync(join(dir, 'events.log'), 'not json\n');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await l.after('r', 0)).toEqual([]);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('line 1'));
    err.mockRestore();
  });

  it('remembers what was delivered, and never goes back', async () => {
    const l = log();
    await l.append('r', { type: 'diagram-failed', diagramId: 'd', error: 'x', at });
    await l.append('r', { type: 'diagram-failed', diagramId: 'e', error: 'y', at });
    await l.markDelivered('r', 2);
    await l.markDelivered('r', 1);
    expect(await l.undelivered('r')).toEqual([]);
  });
});
