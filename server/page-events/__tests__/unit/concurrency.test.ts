/**
 * Claude's tool calls and the page's events reach a run at the same time by
 * design (wait_for_events runs in the background). These tests widen the race
 * window with a deliberately slow store and log, so each fails without the
 * per-run lock or the wait's ordering.
 */
import { describe, expect, it } from 'vitest';
import type { RunState } from '@shared/contract.ts';
import { card, counterIds, question, T0 } from '@test/fixtures.ts';
import { delivered, MemoryLog, MemoryStore, useCases, waited, world } from '@test/fakes.ts';
import { addItems, ask } from '@server/common/domain/item.rules.ts';
import { newRun } from '@server/common/domain/run.rules.ts';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class SlowStore extends MemoryStore {
  override async save(run: RunState) {
    await pause(15);
    return super.save(run);
  }
}
class SlowLog extends MemoryLog {
  override async undelivered(runId: string) {
    const events = await super.undelivered(runId);
    await pause(15);
    return events;
  }
}

async function seeded() {
  const fakes = { ...world(), store: new SlowStore(), log: new SlowLog() };
  const ids = counterIds();
  let run = newRun({ id: 'r1', skill: 'card', project: 'MiPlan', subject: 'v', now: T0, threadId: ids('t') });
  run = addItems(run, [{ kind: 'card', fields: card() }], ids).run;
  run = ask(run, 'i1', [question()], ids).run;
  await fakes.store.save(run);
  return { w: fakes, cases: useCases(fakes), thread: run.items[0]!.threadId, runThread: run.threads[0]!.id };
}

describe('concurrency on one run', () => {
  it("Claude's message and the user's page event both survive when they race", async () => {
    const { w, cases, thread, runThread } = await seeded();
    await Promise.all([
      cases.conversation.sendMessage.execute({ runId: 'r1', text: 'from Claude', threadId: runThread }),
      cases.pageEvents.recordPageEvent.execute({
        runId: 'r1',
        event: { type: 'message', threadId: thread, text: 'from the user' },
      }),
    ]);
    const texts = (await w.store.load('r1'))!.messages.map((message) => message.text).sort();
    expect(texts).toEqual(['from Claude', 'from the user']);
  });

  it('two takers racing deliver each event exactly once between them', async () => {
    const { w, cases, thread } = await seeded();
    await cases.pageEvents.recordPageEvent.execute({
      runId: 'r1',
      event: { type: 'message', threadId: thread, text: 'once' },
    });
    const [first, second] = await Promise.all([delivered(cases), delivered(cases)]);
    expect([...first, ...second].map((event) => event.text)).toEqual(['once']);
  });

  it('an event recorded while the wait is handing over the turn still wakes it', async () => {
    const { w, cases, thread } = await seeded();
    const limits = { ...w.limits, waitTimeoutMs: 5_000 };
    const started = Date.now();
    const waiting = waited(useCases({ ...w, limits }));
    // While the empty check is still running: the event takes the lock before the turn change,
    // so it rings before any wait exists. Only a wait registered first, then re-checked, sees it.
    await pause(5);
    await cases.pageEvents.recordPageEvent.execute({
      runId: 'r1',
      event: { type: 'message', threadId: thread, text: 'in the gap' },
    });
    const result = await waiting;
    expect(result.events.map((event) => event.text)).toEqual(['in the gap']);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
