/**
 * The small slices that change a run from Claude's side. Each is a thin use
 * case over the kernel; these tests check the wiring: saved, shown, result.
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
import { applyVerdict } from '@server/kernel/run.ts';

async function setup() {
  const w = world();
  const { run } = await openSession(w, { skill: 'card', project: 'MiPlan', subject: 'v' });
  const [item] = await addItems(w, { runId: run.id, items: [{ kind: 'card', fields: card() }] });
  return { w, runId: run.id, itemId: item!.id };
}

describe('item slices', () => {
  it('add-items saves and shows, and refuses a card that fails its schema', async () => {
    const { w, runId } = await setup();
    expect((await w.store.load(runId))!.items).toHaveLength(1);
    expect(w.page.last!.items).toHaveLength(1);
    await expect(addItems(w, { runId, items: [{ kind: 'card', fields: { title: 'x' } }] })).rejects.toMatchObject({ code: 'invalid' });
    expect((await w.store.load(runId))!.items).toHaveLength(1);
  });

  it('update-item returns the new revision', async () => {
    const { w, runId, itemId } = await setup();
    expect(await updateItem(w, { runId, itemId, patch: { tags: ['bug'] } })).toEqual({ rev: 2 });
  });

  it('ask returns question ids and the new revision', async () => {
    const { w, runId, itemId } = await setup();
    const r = await ask(w, { runId, itemId, questions: [question()] });
    expect(r).toEqual({ questionIds: ['q1'], rev: 2 });
    expect(w.page.last!.items[0]!.questions[0]!.id).toBe('q1');
  });

  it('send-message posts to the named thread and reports where it landed', async () => {
    const { w, runId, itemId } = await setup();
    const threadId = (await w.store.load(runId))!.items.find((i) => i.id === itemId)!.threadId;
    expect(await sendMessage(w, { runId, text: 'criteria ready', threadId })).toEqual({ messageId: 'm1', threadId });
  });

  it('set-status shows the live line and clears it when empty', async () => {
    const { w, runId } = await setup();
    await setStatus(w, { runId, line: 'adversary round 1 of 2' });
    expect(w.page.last!.statusLine).toBe('adversary round 1 of 2');
    await setStatus(w, { runId, line: '' });
    expect(w.page.last!.statusLine).toBeUndefined();
  });

  it('mark-done needs an approval of the current revision, and then close works', async () => {
    const { w, runId, itemId } = await setup();
    await expect(markDone(w, { runId, itemId, note: 'created 86e3' })).rejects.toMatchObject({ code: 'invalid' });
    await w.store.save(applyVerdict((await w.store.load(runId))!, itemId, 1, 'approved', 'now'));
    await expect(closeSession(w, { runId, status: 'closed', outcome: 'x' })).rejects.toMatchObject({ code: 'open-items' });
    await markDone(w, { runId, itemId, note: 'created 86e3' });
    expect(await closeSession(w, { runId, status: 'closed', outcome: 'created 1' })).toEqual({ status: 'closed' });
    expect(w.page.last!.status).toBe('closed');
  });
});
