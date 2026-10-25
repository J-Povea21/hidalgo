import { describe, expect, it } from 'vitest';
import { delivered, seededWorld, useCases, waited } from '@test/fakes.ts';
import { until } from '@test/fixtures.ts';

const setup = seededWorld;

describe('wait-for-events', () => {
  it('delivers each event exactly once, in order, with answers spelled out', async () => {
    const { fakes, cases, thread } = await setup();
    await cases.pageEvents.recordPageEvent.execute({
      runId: 'r1',
      event: { type: 'answers', itemId: 'i1', answers: { q1: { choice: 0 } } },
    });
    await cases.pageEvents.recordPageEvent.execute({
      runId: 'r1',
      event: { type: 'message', threadId: thread, text: 'and one more thing' },
    });
    const first = await delivered(cases);
    expect(first.map((event) => event.seq)).toEqual([1, 2]);
    expect(first[0]!.answers).toEqual([{ question: 'Card the other validators separately?', chose: 'Separately' }]);
    expect(first[1]).toMatchObject({ type: 'message', item: 'i1', text: 'and one more thing' });
    expect(await delivered(cases)).toEqual([]);
  });

  it('returns at once when events are already waiting', async () => {
    const { fakes, cases, thread } = await setup();
    await cases.pageEvents.recordPageEvent.execute({
      runId: 'r1',
      event: { type: 'message', threadId: thread, text: 'queued while you worked' },
    });
    const result = await waited(cases);
    expect(result.events).toHaveLength(1);
    expect(fakes.page.shown.some((run) => run.turn === 'user')).toBe(false);
  });

  it("marks it the user's turn while waiting, and wakes on the next event", async () => {
    const { fakes, cases, thread } = await setup();
    const waiting = waited(cases);
    await until(() => fakes.page.last?.turn === 'user');
    await cases.pageEvents.recordPageEvent.execute({
      runId: 'r1',
      event: { type: 'message', threadId: thread, text: 'here you go' },
    });
    const result = await waiting;
    expect(result.events.map((event) => event.text)).toEqual(['here you go']);
    expect(fakes.page.last!.turn).toBe('claude');
  });

  it('times out with nothing, and hands the turn back', async () => {
    const { fakes, cases } = await setup();
    const result = await waited(cases);
    expect(result).toEqual({ events: [], timedOut: true });
    expect(fakes.page.last!.turn).toBe('claude');
  });

  it('hands Claude a repeated image once, while the message keeps both attachments', async () => {
    const { fakes, cases, thread } = await setup();
    // The fake store names files by order; make it name by content, like the real one.
    fakes.images.save = async (_runId, url) => `${url.length}.webp`;
    const png = 'data:image/png;base64,AAAA';
    await cases.pageEvents.recordPageEvent.execute({
      runId: 'r1',
      event: { type: 'message', threadId: thread, text: 'twice', images: [png, png] },
    });
    expect((await delivered(cases))[0]!.images).toEqual(['/data/runs/r1/images/26.webp']);
    expect((await fakes.store.load('r1'))!.messages[0]!.images).toEqual(['26.webp', '26.webp']);
  });

  it('gives images as paths Claude can open', async () => {
    const { fakes, cases, thread } = await setup();
    await cases.pageEvents.recordPageEvent.execute({
      runId: 'r1',
      event: {
        type: 'message',
        threadId: thread,
        text: 'x',
        images: ['data:image/png;base64,AAAA'],
      },
    });
    expect((await delivered(cases))[0]!.images).toEqual(['/data/runs/r1/images/img1.webp']);
  });
});
