import { describe, expect, it } from 'vitest';
import { seededWorld } from '@test/fakes.ts';
import { until } from '@test/fixtures.ts';
import { recordPageEvent } from './record-page-event.ts';

const setup = seededWorld;
const png = 'data:image/png;base64,' + 'A'.repeat(400);

describe('record-page-event', () => {
  it('logs the event first, then applies, saves, shows it, and rings the bell', async () => {
    const { fakes } = await setup();
    let rang = false;
    fakes.signal.ring = () => {
      rang = true;
    };
    const { seq } = await recordPageEvent(fakes, 'r1', {
      type: 'answers',
      itemId: 'i1',
      answers: { q1: { choice: 1, note: 'here' } },
    });
    expect(seq).toBe(1);
    expect((await fakes.log.after('r1', 0))[0]).toMatchObject({ seq: 1, type: 'answers' });
    const saved = (await fakes.store.load('r1'))!;
    expect(saved.items[0]!.questions[0]!.answer).toMatchObject({ choice: 1, note: 'here' });
    expect(saved.appliedSeq).toBe(1);
    expect(saved.eventThreads[1]).toBe(saved.items[0]!.threadId);
    expect(fakes.page.last!.version).toBe(saved.version);
    expect(rang).toBe(true);
  });

  it('refuses an Approve with open questions, with the reason, and logs nothing', async () => {
    const { fakes } = await setup();
    await expect(
      recordPageEvent(fakes, 'r1', { type: 'verdict', itemId: 'i1', rev: 2, value: 'approved' }),
    ).rejects.toMatchObject({ code: 'open-questions' });
    expect(await fakes.log.after('r1', 0)).toEqual([]);
  });

  it('refuses a verdict on a stale revision', async () => {
    const { fakes } = await setup();
    await expect(
      recordPageEvent(fakes, 'r1', { type: 'verdict', itemId: 'i1', rev: 1, value: 'rejected' }),
    ).rejects.toMatchObject({ code: 'stale-revision' });
  });

  it('refuses a message to a thread outside the run, and malformed events', async () => {
    const { fakes } = await setup();
    await expect(
      recordPageEvent(fakes, 'r1', { type: 'message', threadId: 'elsewhere', text: 'hi' }),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(recordPageEvent(fakes, 'r1', { type: 'nonsense' })).rejects.toMatchObject({ code: 'invalid' });
  });

  it('stores images and records them by file name', async () => {
    const { fakes, run } = await setup();
    await recordPageEvent(fakes, 'r1', {
      type: 'message',
      threadId: run.items[0]!.threadId,
      text: 'see',
      images: [png],
    });
    expect((await fakes.log.after('r1', 0))[0]).toMatchObject({ images: ['img1.webp'] });
    expect((await fakes.store.load('r1'))!.messages[0]).toMatchObject({ from: 'user', images: ['img1.webp'] });
  });

  it('warns near the image limit and refuses past it', async () => {
    const { fakes, run } = await setup();
    const thread = run.items[0]!.threadId;
    const first = await recordPageEvent(fakes, 'r1', {
      type: 'message',
      threadId: thread,
      text: 'a',
      images: [png, png],
    });
    expect(first.imageWarning).toBeUndefined();
    const second = await recordPageEvent(fakes, 'r1', { type: 'message', threadId: thread, text: 'b', images: [png] });
    expect(second.imageWarning).toBeDefined();
    await expect(
      recordPageEvent(fakes, 'r1', { type: 'message', threadId: thread, text: 'c', images: [png, png] }),
    ).rejects.toMatchObject({ code: 'limit' });
  });

  it('refuses images that are not images', async () => {
    const { fakes, run } = await setup();
    await expect(
      recordPageEvent(fakes, 'r1', {
        type: 'message',
        threadId: run.items[0]!.threadId,
        text: 'x',
        images: ['data:text/html;base64,PHNjcmlwdD4='],
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});
