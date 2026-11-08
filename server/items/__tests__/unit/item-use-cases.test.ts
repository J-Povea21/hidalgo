/**
 * The small use cases that change a run from Claude's side. Each is thin over
 * the domain; these tests check the wiring: saved, shown, result.
 */
import { describe, expect, it } from 'vitest';
import { ConversationMapper } from '@server/conversation/application/mappers/conversation.mapper.ts';
import { ItemMapper } from '@server/items/application/mappers/item.mapper.ts';
import { RunMapper } from '@server/runs/application/mappers/run.mapper.ts';
import { card, question } from '@test/fixtures.ts';
import { useCases, world } from '@test/fakes.ts';
import { applyVerdict } from '@server/common/domain/item.rules.ts';

async function setup() {
  const fakes = world();
  const cases = useCases(fakes);
  const { run } = await cases.runs.openSession.execute({ skill: 'card', project: 'Storefront', subject: 'v' });
  const [item] = await cases.items.addItems.execute({
    runId: run.id,
    items: [{ kind: 'card', fields: card() }],
  });
  return { fakes, cases, runId: run.id, itemId: item!.id };
}

describe("the use cases that change a run from Claude's side", () => {
  it('add-items saves and shows, and refuses a card that fails its schema', async () => {
    const { fakes, cases, runId } = await setup();
    expect((await fakes.store.load(runId))!.items).toHaveLength(1);
    expect(fakes.page.last!.items).toHaveLength(1);
    await expect(
      cases.items.addItems.execute({ runId, items: [{ kind: 'card', fields: { title: 'x' } }] }),
    ).rejects.toMatchObject({
      code: 'invalid',
    });
    expect((await fakes.store.load(runId))!.items).toHaveLength(1);
  });

  it('update-item returns the new revision', async () => {
    const { fakes, cases, runId, itemId } = await setup();
    const item = await cases.items.updateItem.execute({ runId, itemId, patch: { tags: ['bug'] } });

    expect(ItemMapper.toRevision(item)).toEqual({ rev: 2 });
  });

  it('ask returns question ids and the new revision', async () => {
    const { fakes, cases, runId, itemId } = await setup();
    const asked = await cases.items.ask.execute({ runId, itemId, questions: [question()] });

    expect(ItemMapper.toAsked(asked)).toEqual({ questionIds: ['q1'], rev: 2 });
    expect(fakes.page.last!.items[0]!.questions[0]!.id).toBe('q1');
  });

  it('send-message posts to the named thread and reports where it landed', async () => {
    const { fakes, cases, runId, itemId } = await setup();
    const threadId = (await fakes.store.load(runId))!.items.find((item) => item.id === itemId)!.threadId;
    const message = await cases.conversation.sendMessage.execute({ runId, text: 'criteria ready', threadId });

    expect(ConversationMapper.toSent(message)).toEqual({ messageId: 'm1', threadId });
  });

  it('set-status shows the live line and clears it when empty', async () => {
    const { fakes, cases, runId } = await setup();
    await cases.runs.setStatus.execute({ runId, line: 'adversary round 1 of 2' });
    expect(fakes.page.last!.statusLine).toBe('adversary round 1 of 2');
    await cases.runs.setStatus.execute({ runId, line: '' });
    expect(fakes.page.last!.statusLine).toBeUndefined();
  });

  it('mark-done needs an approval of the current revision, and then close works', async () => {
    const { fakes, cases, runId, itemId } = await setup();
    await expect(cases.items.markDone.execute({ runId, itemId, note: 'created ABC-142' })).rejects.toMatchObject({
      code: 'invalid',
    });
    await fakes.store.save(applyVerdict((await fakes.store.load(runId))!, itemId, 1, 'approved', 'now'));
    await expect(cases.runs.closeSession.execute({ runId, status: 'closed', outcome: 'x' })).rejects.toMatchObject({
      code: 'open-items',
    });
    await cases.items.markDone.execute({ runId, itemId, note: 'created ABC-142' });
    const closed = await cases.runs.closeSession.execute({ runId, status: 'closed', outcome: 'created 1' });
    expect(RunMapper.toClosed(closed)).toEqual({ status: 'closed' });
    expect(fakes.page.last!.status).toBe('closed');
  });
});
