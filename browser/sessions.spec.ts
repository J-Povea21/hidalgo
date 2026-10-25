/** More than one: two Claude sessions on the machine, and one run open in two tabs. */
import { plainCard } from './support/data.ts';
import { expect, test } from './support/test.ts';
import { UserInPage } from './support/user.ts';

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
  await user.opensReviews();
  const link = user.page.getByRole('link', { name: /Mi Titulo · card · run B/ });
  await expect(link).toBeVisible();
  await expect(link).toContainText('Claude is working');

  const popup = context.waitForEvent('page');
  await link.click();
  const inB = new UserInPage(await popup);
  await expect(inB.heading('B card')).toBeVisible();
  await expect.poll(() => inB.connection()).toBe('live');

  const verdict = claude.waitsForTheUser(runA);
  await user.rejects();
  expect(await verdict).toEqual([expect.objectContaining({ verdict: 'rejected', item: runA.items[0]!.id })]);
  // B's next tool result would carry anything recorded for it: nothing was.
  expect(await otherClaude.setsStatus(runB, 'checking')).not.toHaveProperty('events');
});

test('one run in two tabs: both follow it, and a resume counts both', async ({ claude, user, context }) => {
  const run = await claude.opensRun();
  await user.opens(run);
  const secondTab = new UserInPage(await context.newPage());
  await secondTab.opens(run);
  await expect.poll(() => secondTab.connection()).toBe('live');

  const verdict = claude.waitsForTheUser(run);
  await user.leavesPending();
  expect(await verdict).toEqual([expect.objectContaining({ verdict: 'pending', item: run.items[0]!.id })]);
  await expect(secondTab.verdictBadge('pending')).toBeVisible();

  await claude.pauses(run);
  expect(await claude.resumes(run)).toMatchObject({ opened: false, alreadyOpen: 2 });
});
