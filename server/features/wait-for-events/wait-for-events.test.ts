import { describe, expect, it } from 'vitest';
import { seededWorld } from '@test/fakes.ts';
import { until } from '@test/fixtures.ts';
import { recordPageEvent } from '@server/features/record-page-event/record-page-event.ts';
import { takeEvents, waitForEvents } from './wait-for-events.ts';

const setup = seededWorld;

describe('wait-for-events', () => {
  it('delivers each event exactly once, in order, with answers spelled out', async () => {
    const { fakes, thread } = await setup();
    await recordPageEvent(fakes, 'r1', { type: 'answers', itemId: 'i1', answers: { q1: { choice: 0 } } });
    await recordPageEvent(fakes, 'r1', { type: 'message', threadId: thread, text: 'and one more thing' });
    const first = await takeEvents(fakes, 'r1');
    expect(first.map((event) => event.seq)).toEqual([1, 2]);
    expect(first[0]!.answers).toEqual([{ question: 'Card the other validators separately?', chose: 'Separately' }]);
    expect(first[1]).toMatchObject({ type: 'message', item: 'i1', text: 'and one more thing' });
    expect(await takeEvents(fakes, 'r1')).toEqual([]);
  });

  it('returns at once when events are already waiting', async () => {
    const { fakes, thread } = await setup();
    await recordPageEvent(fakes, 'r1', { type: 'message', threadId: thread, text: 'queued while you worked' });
    const result = await waitForEvents(fakes, 'r1');
    expect(result.events).toHaveLength(1);
    expect(fakes.page.shown.some((run) => run.turn === 'user')).toBe(false);
  });

  it("marks it the user's turn while waiting, and wakes on the next event", async () => {
    const { fakes, thread } = await setup();
    const waiting = waitForEvents(fakes, 'r1');
    await until(() => fakes.page.last?.turn === 'user');
    await recordPageEvent(fakes, 'r1', { type: 'message', threadId: thread, text: 'here you go' });
    const result = await waiting;
    expect(result.events.map((event) => event.text)).toEqual(['here you go']);
    expect(fakes.page.last!.turn).toBe('claude');
  });

  it('times out with nothing, and hands the turn back', async () => {
    const { fakes } = await setup();
    const result = await waitForEvents(fakes, 'r1');
    expect(result).toEqual({ events: [], timedOut: true });
    expect(fakes.page.last!.turn).toBe('claude');
  });

  it('hands Claude a repeated image once, while the message keeps both attachments', async () => {
    const { fakes, thread } = await setup();
    // The fake store names files by order; make it name by content, like the real one.
    fakes.images.save = async (_runId, url) => `${url.length}.webp`;
    const png = 'data:image/png;base64,AAAA';
    await recordPageEvent(fakes, 'r1', { type: 'message', threadId: thread, text: 'twice', images: [png, png] });
    expect((await takeEvents(fakes, 'r1'))[0]!.images).toEqual(['/data/runs/r1/images/26.webp']);
    expect((await fakes.store.load('r1'))!.messages[0]!.images).toEqual(['26.webp', '26.webp']);
  });

  it('gives images as paths Claude can open', async () => {
    const { fakes, thread } = await setup();
    await recordPageEvent(fakes, 'r1', {
      type: 'message',
      threadId: thread,
      text: 'x',
      images: ['data:image/png;base64,AAAA'],
    });
    expect((await takeEvents(fakes, 'r1'))[0]!.images).toEqual(['/data/runs/r1/images/img1.webp']);
  });
});
