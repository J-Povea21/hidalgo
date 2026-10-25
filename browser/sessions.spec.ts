/** More than one: two Claude sessions on the machine, and one run open in two tabs. */
import { expect, plainCard, test, UserInPage } from './support/index.ts';

test("Open reviews lists another session's run and opens it; what happens in one never reaches the other", async ({
  claude,
  anotherClaude,
  user,
  context,
}) => {
  const runA = await claude.opensRun({ subject: 'run A' });
  const otherClaude = await anotherClaude();
  const runB = await otherClaude.opensRun({ project: 'Mi Titulo', subject: 'run B', cards: [plainCard('B card')] });
  await user.opens(runA);

  await user.drawers.openReviews();

  const link = user.page.getByRole('link', { name: /Mi Titulo · card · run B/ });
  await expect(link).toBeVisible();
  await expect(link).toContainText('Claude is working');

  const popup = context.waitForEvent('page');
  await link.click();
  const inB = new UserInPage(await popup);

  await expect(inB.items.heading('B card')).toBeVisible();
  await expect.poll(() => inB.status.connection()).toBe('live');

  const rejection = runA.waitForTheUser();
  await user.verdict.reject();

  expect(await rejection).toEqual([expect.objectContaining({ verdict: 'rejected', item: runA.items[0]!.id })]);
  // B's next tool result would carry anything recorded for it: nothing was.
  expect(await runB.setStatus('checking')).not.toHaveProperty('events');
});

test('one run in two tabs: both follow it, and a resume counts both', async ({ claude, user, context }) => {
  const run = await claude.opensRun();
  await user.opens(run);
  const secondTab = new UserInPage(await context.newPage());
  await secondTab.opens(run);
  await expect.poll(() => secondTab.status.connection()).toBe('live');

  const leftPending = run.waitForTheUser();
  await user.verdict.leavePending();

  expect(await leftPending).toEqual([expect.objectContaining({ verdict: 'pending', item: run.items[0]!.id })]);
  await expect(secondTab.verdict.badge('pending')).toBeVisible();

  await run.pause();

  expect(await run.resume()).toMatchObject({ opened: false, alreadyOpen: 2 });
});
