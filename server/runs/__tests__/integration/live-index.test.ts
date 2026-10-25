import { describe, expect, it } from 'vitest';
import { ownStart, processAlive } from '@server/runs/infrastructure/fs/live-index.ts';

const STARTED = '2026-10-24T22:00:00.000Z';
const SECONDS_LATER = (seconds: number) => Date.parse(STARTED) + seconds * 1000;

describe("whether a live entry's process is still alive", () => {
  it('this process, with its own start time, is alive', () => {
    expect(processAlive(process.pid, ownStart())).toBe(true);
  });

  it('a pid that is not running is dead', () => {
    expect(processAlive(4242, STARTED, () => ({ running: false }))).toBe(false);
  });

  it('a running pid that started at another time is a reused pid, so the entry is dead', () => {
    expect(processAlive(4242, STARTED, () => ({ running: true, startedAt: SECONDS_LATER(60) }))).toBe(false);
  });

  it('a running pid whose start time cannot be read (no `ps`, as on Windows) is alive', () => {
    expect(processAlive(4242, STARTED, () => ({ running: true }))).toBe(true);
  });
});
