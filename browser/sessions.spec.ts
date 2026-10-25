/** More than one: two Claude sessions on the machine, and one run open in two tabs. */
import { card, connectionOf, expect, openRun, test } from './harness.ts';

test("B-14 Open reviews lists the other session's run and opens it; what one does never reaches the other", async ({
  page,
  wb,
  newSession,
  context,
}) => {
  const runA = await openRun(wb, [{}], 'run A');
  const other = await newSession();
  const { runId: bRun } = await other.call('open_session', { skill: 'card', project: 'Mi Titulo', subject: 'run B' });
  await other.call('add_items', { runId: bRun, items: [{ kind: 'card', fields: card('B card') }] });

  await page.goto(runA.url);
  await page.getByRole('button', { name: 'Open reviews' }).click();
  const link = page.getByRole('link', { name: /Mi Titulo · card · run B/ });
  await expect(link).toBeVisible();
  await expect(link).toContainText('Claude is working');

  const popup = context.waitForEvent('page');
  await link.click();
  const pageB = await popup;
  await expect(pageB.getByRole('heading', { name: 'B card' })).toBeVisible();
  await expect.poll(() => connectionOf(pageB)).toBe('live');

  // A verdict in A is A's alone: B's next tool result carries nothing.
  const waitA = wb.start('wait_for_events', { runId: runA.runId });
  await page.getByRole('button', { name: 'Reject' }).click();
  expect((await waitA).events[0]).toMatchObject({ verdict: 'rejected', item: runA.added[0]!.id });
  expect(await other.call('set_status', { runId: bRun, line: 'checking' })).not.toHaveProperty('events');
});

test('B-14 one run in two tabs: both follow it, and a resume counts both', async ({ page, wb, context }) => {
  const { runId, added, url } = await openRun(wb);
  await page.goto(url);
  const second = await context.newPage();
  await second.goto(url);
  await expect.poll(() => connectionOf(second)).toBe('live');

  const waiting = wb.start('wait_for_events', { runId });
  await page.getByRole('button', { name: 'Leave pending' }).click();
  expect((await waiting).events[0]).toMatchObject({ verdict: 'pending', item: added[0]!.id });
  await expect(second.locator('.verdict .badge.pending')).toBeVisible();

  await wb.call('close_session', { runId, status: 'paused', outcome: 'later' });
  expect(
    await wb.call('open_session', { skill: 'card', project: 'MiPlan', subject: 's', resume: runId }),
  ).toMatchObject({ opened: false, alreadyOpen: 2 });
});
