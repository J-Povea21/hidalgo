import { describe, expect, it } from 'vitest';
import { card, counterIds, question, T0 } from '../../../test/fixtures.ts';
import { world } from '../../../test/fakes.ts';
import { addItems, ask, newRun } from '../../kernel/run.ts';
import { recordPageEvent } from '../record-page-event/record-page-event.ts';
import { takeEvents, waitForEvents } from './wait-for-events.ts';

async function setup() {
  const w = world();
  const ids = counterIds();
  let run = newRun({ id: 'r1', skill: 'card', project: 'MiPlan', subject: 'v', now: T0, threadId: ids('t') });
  run = addItems(run, [{ kind: 'card', fields: card() }], ids).run;
  run = ask(run, 'i1', [question()], ids).run;
  await w.store.save(run);
  return { w, thread: run.items[0]!.threadId };
}

describe('wait-for-events', () => {
  it('delivers each event exactly once, in order, with answers spelled out', async () => {
    const { w, thread } = await setup();
    await recordPageEvent(w, 'r1', { type: 'answers', itemId: 'i1', answers: { q1: { choice: 0 } } });
    await recordPageEvent(w, 'r1', { type: 'message', threadId: thread, text: 'and one more thing' });
    const first = await takeEvents(w, 'r1');
    expect(first.map((e) => e.seq)).toEqual([1, 2]);
    expect(first[0]!.answers).toEqual([{ question: 'Card the other validators separately?', chose: 'Separately' }]);
    expect(first[1]).toMatchObject({ type: 'message', item: 'i1', text: 'and one more thing' });
    expect(await takeEvents(w, 'r1')).toEqual([]);
  });

  it('returns at once when events are already waiting', async () => {
    const { w, thread } = await setup();
    await recordPageEvent(w, 'r1', { type: 'message', threadId: thread, text: 'queued while you worked' });
    const r = await waitForEvents(w, 'r1');
    expect(r.events).toHaveLength(1);
    expect(w.page.shown.some((s) => s.turn === 'user')).toBe(false);
  });

  it("marks it the user's turn while waiting, and wakes on the next event", async () => {
    const { w, thread } = await setup();
    const waiting = waitForEvents(w, 'r1');
    await new Promise((r) => setTimeout(r, 20));
    expect(w.page.last!.turn).toBe('user');
    await recordPageEvent(w, 'r1', { type: 'message', threadId: thread, text: 'here you go' });
    const r = await waiting;
    expect(r.events.map((e) => e.text)).toEqual(['here you go']);
    expect(w.page.last!.turn).toBe('claude');
  });

  it('times out with nothing, and hands the turn back', async () => {
    const { w } = await setup();
    const r = await waitForEvents(w, 'r1');
    expect(r).toEqual({ events: [], timedOut: true });
    expect(w.page.last!.turn).toBe('claude');
  });

  it('gives images as paths Claude can open', async () => {
    const { w, thread } = await setup();
    await recordPageEvent(w, 'r1', { type: 'message', threadId: thread, text: 'x', images: ['data:image/png;base64,AAAA'] });
    expect((await takeEvents(w, 'r1'))[0]!.images).toEqual(['/data/runs/r1/images/img1.webp']);
  });
});
