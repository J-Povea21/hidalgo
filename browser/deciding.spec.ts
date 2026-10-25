/** Answering Claude's questions and deciding on each item: the main path through a run. */
import { cardAsking, expect, FAVICON, plainCard, test } from './support';

test.describe('answering questions', () => {
  test('the answers reach Claude with their notes, and then Approve unlocks', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [cardAsking('First?', 'Second?')] });
    await user.opens(run);
    await expect(user.verdict.approveButton).toBeDisabled();
    await expect(user.verdict.approveButton).toHaveAccessibleDescription('Answer the 2 open questions first');

    const answers = run.waitForTheUser();
    await user.questions.pick('Here');
    await expect(user.questions.heading(2, 2)).toBeVisible();
    await user.questions.pick('Neither');
    await user.questions.note('leave them for now');
    await user.questions.send(2);

    expect(await answers).toEqual([
      expect.objectContaining({
        type: 'answers',
        item: run.items[0]!.id,
        answers: [
          { question: 'First?', chose: 'Here' },
          { question: 'Second?', chose: 'Neither', note: 'leave them for now' },
        ],
      }),
    ]);
    await expect(user.questions.allAnswered).toBeVisible();
    await expect(user.verdict.approveButton).toBeEnabled();
  });
});

test.describe('deciding', () => {
  test('approving, marking done and closing: the page shows the run ended', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [plainCard(), plainCard()] });
    await user.opens(run);

    const approval = run.waitForTheUser();
    await user.verdict.approve();

    expect(await approval).toEqual([expect.objectContaining({ type: 'verdict', verdict: 'approved', rev: 1 })]);
    await expect(user.page.getByText('Approved · rev 1')).toBeVisible();

    await run.markDone(run.items[0]!.id);
    await user.items.next();
    const rejection = run.waitForTheUser();
    await user.verdict.reject();

    expect(await rejection).toEqual([expect.objectContaining({ verdict: 'rejected', item: run.items[1]!.id })]);

    await run.close('created 1, rejected 1');

    await expect(user.page).toHaveTitle(/^✓ /);
    await expect(user.status.turnLine).toHaveText('Run ended');
    await expect.poll(() => user.status.favicon()).toBe(FAVICON.done);
    await expect(user.thread.composer).toBeDisabled();
  });

  test('an item left pending can be approved later', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);

    const leftPending = run.waitForTheUser();
    await user.verdict.leavePending();

    expect(await leftPending).toEqual([expect.objectContaining({ verdict: 'pending' })]);
    await expect(user.verdict.badge('pending')).toBeVisible();

    const approval = run.waitForTheUser();
    await user.verdict.approve();

    expect(await approval).toEqual([expect.objectContaining({ verdict: 'approved' })]);
  });

  test('a revision from Claude voids the approval, and the buttons come back for the new one', async ({
    claude,
    user,
  }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    const approval = run.waitForTheUser();
    await user.verdict.approve();
    await approval;

    await run.revise(run.items[0]!.id, { tags: ['revised'] });

    await expect(user.verdict.approves(2)).toBeVisible();
    await expect(user.verdict.approveButton).toBeEnabled();
  });

  test('rejecting shows the item as rejected', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);

    const rejection = run.waitForTheUser();
    await user.verdict.reject();

    expect(await rejection).toEqual([expect.objectContaining({ verdict: 'rejected' })]);
    await expect(user.verdict.badge('rejected')).toBeVisible();
  });
});

test.describe('editing the card', () => {
  test('an edited criterion reaches Claude, and the new revision says the user changed it', async ({
    claude,
    user,
  }) => {
    const run = await claude.opensRun();
    await user.opens(run);

    const edit = run.waitForTheUser();
    await user.items.editCriterion('The validator rejects a non-array with a 400');

    expect(await edit).toEqual([
      expect.objectContaining({
        type: 'edit',
        item: run.items[0]!.id,
        path: 'criteria.0.text',
        text: 'The validator rejects a non-array with a 400',
      }),
    ]);
    await expect(user.page.getByText('edited by you · will be re-probed')).toBeVisible();
    await expect(user.verdict.approves(2)).toBeVisible();
  });

  test('the card shows its fields as Claude wrote them', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [plainCard('A card with every field')] });

    await user.opens(run);

    await expect(user.items.heading('A card with every field')).toBeVisible();
    await expect(user.page.locator('.chip')).toHaveText(['backend', 'bug']);
    await expect(user.page.getByText('The validator guards its own input')).toBeVisible();
    await expect(user.page.locator('code').filter({ hasText: 'officeIds' })).toBeVisible();
  });
});

test.describe('moving between items', () => {
  test('the item on screen and an unsent draft survive a reload', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [plainCard(), plainCard(), plainCard()] });
    await user.opens(run);
    await user.items.next();
    await user.items.next();
    await user.thread.composer.fill('a draft I have not sent');

    await user.page.reload();

    await expect(user.items.heading('Card 3')).toBeVisible();
    await expect(user.thread.composer).toHaveValue('a draft I have not sent');
  });

  test('the progress bar names each item and its state, and jumps to it', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [plainCard(), plainCard()] });
    await user.opens(run);

    await user.items.progress.getByRole('button', { name: 'Card 2: ready' }).click();

    await expect(user.items.heading('Card 2')).toBeVisible();
  });
});

test.fixme('two runs with the same subject show their start time in the tab title', async () => {
  // A future improvement; the card's criterion stays open until it is built.
});
