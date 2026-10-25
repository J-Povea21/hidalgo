/**
 * Claude's tool calls and the page's events reach a run at the same time by
 * design (wait_for_events runs in the background). These tests widen the race
 * window with a deliberately slow store and log, so each fails without the
 * per-run lock or the wait's ordering.
 */
import { describe, expect, it } from 'vitest';
import type { RunState } from '@shared/contract.ts';
import { card, counterIds, question, T0 } from '@test/fixtures.ts';
import { MemoryLog, MemoryStore, world } from '@test/fakes.ts';
import { addItems, ask, newRun } from '@server/kernel/run.ts';
import { recordPageEvent } from './record-page-event/record-page-event.ts';
import { sendMessage } from './send-message/send-message.ts';
import { takeEvents, waitForEvents } from './wait-for-events/wait-for-events.ts';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

class SlowStore extends MemoryStore {
  override async save(run: RunState) { await pause(15); return super.save(run); }
}
class SlowLog extends MemoryLog {
  override async undelivered(runId: string) { const e = await super.undelivered(runId); await pause(15); return e; }
}

async function seeded() {
  const w = { ...world(), store: new SlowStore(), log: new SlowLog() };
  const ids = counterIds();
  let run = newRun({ id: 'r1', skill: 'card', project: 'MiPlan', subject: 'v', now: T0, threadId: ids('t') });
  run = addItems(run, [{ kind: 'card', fields: card() }], ids).run;
  run = ask(run, 'i1', [question()], ids).run;
  await w.store.save(run);
  return { w, thread: run.items[0]!.threadId, runThread: run.threads[0]!.id };
}

describe('concurrency on one run', () => {
  it("Claude's message and the user's page event both survive when they race", async () => {
    const { w, thread, runThread } = await seeded();
    await Promise.all([
      sendMessage(w, { runId: 'r1', text: 'from Claude', threadId: runThread }),
      recordPageEvent(w, 'r1', { type: 'message', threadId: thread, text: 'from the user' }),
    ]);
    const texts = (await w.store.load('r1'))!.messages.map((m) => m.text).sort();
    expect(texts).toEqual(['from Claude', 'from the user']);
  });

  it('two takers racing deliver each event exactly once between them', async () => {
    const { w, thread } = await seeded();
    await recordPageEvent(w, 'r1', { type: 'message', threadId: thread, text: 'once' });
    const [a, b] = await Promise.all([takeEvents(w, 'r1'), takeEvents(w, 'r1')]);
    expect([...a, ...b].map((e) => e.text)).toEqual(['once']);
  });

  it('an event recorded while the wait is handing over the turn still wakes it', async () => {
    const { w, thread } = await seeded();
    const limits = { ...w.limits, waitTimeoutMs: 5_000 };
    const started = Date.now();
    const waiting = waitForEvents({ ...w, limits }, 'r1');
    // While the empty check is still running: the event takes the lock before the turn change,
    // so it rings before any wait exists. Only a wait registered first, then re-checked, sees it.
    await pause(5);
    await recordPageEvent(w, 'r1', { type: 'message', threadId: thread, text: 'in the gap' });
    const r = await waiting;
    expect(r.events.map((e) => e.text)).toEqual(['in the gap']);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
