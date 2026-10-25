import { card, expect, question, test } from './harness.ts';

test('answering in the page reaches Claude, and Approve unlocks', async ({ page, wb }) => {
  const { runId } = await wb.call('open_session', { skill: 'card', project: 'MiPlan', subject: 'smoke' });
  const url = wb.pages.at(-1)!;
  const { added } = await wb.call('add_items', { runId, items: [{ kind: 'card', fields: card(), questions: [question] }] });

  await page.goto(url);
  await expect(page.getByRole('heading', { name: card().title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();

  const waiting = wb.start('wait_for_events', { runId });
  await expect(page.getByRole('status').filter({ hasText: 'Your turn' })).toBeVisible();

  await page.getByLabel(/Here/).check();
  await page.getByRole('button', { name: /Send 1 answer/ }).click();

  const { events } = await waiting;
  expect(events[0]).toMatchObject({ type: 'answers', item: added[0].id, answers: [{ chose: 'Here' }] });
  await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
});
