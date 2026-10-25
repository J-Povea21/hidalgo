/**
 * The small slices that change a run from Claude's side. Each is a thin use
 * case over the domain; these tests check the wiring: saved, shown, result.
 */
import { describe, expect, it } from 'vitest';
import { card, question } from '@test/fixtures.ts';
import { world } from '@test/fakes.ts';
import { addItems } from './add-items/add-items.ts';
import { ask } from './ask/ask.ts';
import { closeSession } from './close-session/close-session.ts';
import { markDone } from './mark-done/mark-done.ts';
import { openSession } from './open-session/open-session.ts';
import { sendMessage } from './send-message/send-message.ts';
import { setStatus } from './set-status/set-status.ts';
import { updateItem } from './update-item/update-item.ts';
import { applyVerdict } from '@server/domain/run.ts';

async function setup() {
  const fakes = world();
  const { run } = await openSession(fakes, { skill: 'card', project: 'MiPlan', subject: 'v' });
  const [item] = await addItems(fakes, { runId: run.id, items: [{ kind: 'card', fields: card() }] });
  return { fakes, runId: run.id, itemId: item!.id };
}

describe('item slices', () => {
  it('add-items saves and shows, and refuses a card that fails its schema', async () => {
    const { fakes, runId } = await setup();
    expect((await fakes.store.load(runId))!.items).toHaveLength(1);
    expect(fakes.page.last!.items).toHaveLength(1);
    await expect(addItems(fakes, { runId, items: [{ kind: 'card', fields: { title: 'x' } }] })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect((await fakes.store.load(runId))!.items).toHaveLength(1);
  });

  it('update-item returns the new revision', async () => {
    const { fakes, runId, itemId } = await setup();
    expect(await updateItem(fakes, { runId, itemId, patch: { tags: ['bug'] } })).toEqual({ rev: 2 });
  });

  it('ask returns question ids and the new revision', async () => {
    const { fakes, runId, itemId } = await setup();
    const result = await ask(fakes, { runId, itemId, questions: [question()] });
    expect(result).toEqual({ questionIds: ['q1'], rev: 2 });
    expect(fakes.page.last!.items[0]!.questions[0]!.id).toBe('q1');
  });

  it('send-message posts to the named thread and reports where it landed', async () => {
    const { fakes, runId, itemId } = await setup();
    const threadId = (await fakes.store.load(runId))!.items.find((item) => item.id === itemId)!.threadId;
    expect(await sendMessage(fakes, { runId, text: 'criteria ready', threadId })).toEqual({
      messageId: 'm1',
      threadId,
    });
  });

  it('set-status shows the live line and clears it when empty', async () => {
    const { fakes, runId } = await setup();
    await setStatus(fakes, { runId, line: 'adversary round 1 of 2' });
    expect(fakes.page.last!.statusLine).toBe('adversary round 1 of 2');
    await setStatus(fakes, { runId, line: '' });
    expect(fakes.page.last!.statusLine).toBeUndefined();
  });

  it('mark-done needs an approval of the current revision, and then close works', async () => {
    const { fakes, runId, itemId } = await setup();
    await expect(markDone(fakes, { runId, itemId, note: 'created 86e3' })).rejects.toMatchObject({ code: 'invalid' });
    await fakes.store.save(applyVerdict((await fakes.store.load(runId))!, itemId, 1, 'approved', 'now'));
    await expect(closeSession(fakes, { runId, status: 'closed', outcome: 'x' })).rejects.toMatchObject({
      code: 'open-items',
    });
    await markDone(fakes, { runId, itemId, note: 'created 86e3' });
    expect(await closeSession(fakes, { runId, status: 'closed', outcome: 'created 1' })).toEqual({ status: 'closed' });
    expect(fakes.page.last!.status).toBe('closed');
  });
});
