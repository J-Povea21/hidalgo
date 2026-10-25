/** Answering Claude's questions and deciding on each item: the main path through a run. */
import { cardAsking, plainCard } from './support/data.ts';
import { expect, test } from './support/test.ts';
import { FAVICON } from './support/user.ts';

test.describe('answering questions', () => {
  test('the answers reach Claude with their notes, and then Approve unlocks', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [cardAsking('First?', 'Second?')] });
    await user.opens(run);
    await expect(user.button('Approve')).toBeDisabled();
    await expect(user.button('Approve')).toHaveAccessibleDescription('Answer the 2 open questions first');

    const answers = claude.waitsForTheUser(run);
    await user.picks('Here');
    await expect(user.heading('Question 2 of 2')).toBeVisible();
    await user.picks('Neither');
    await user.notes('leave them for now');
    await user.sendsAnswers(2);

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
    await expect(user.page.getByText('Nothing left to decide on this item')).toBeVisible();
    await expect(user.button('Approve')).toBeEnabled();
  });
});

test.describe('deciding', () => {
  test('approving, marking done and closing: the page shows the run ended', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [plainCard(), plainCard()] });
    await user.opens(run);

    let verdict = claude.waitsForTheUser(run);
    await user.approves();
    expect(await verdict).toEqual([expect.objectContaining({ type: 'verdict', verdict: 'approved', rev: 1 })]);
    await expect(user.page.getByText('Approved · rev 1')).toBeVisible();
    await claude.marksDone(run, run.items[0]!.id);

    await user.goesToNextItem();
    verdict = claude.waitsForTheUser(run);
    await user.rejects();
    expect(await verdict).toEqual([expect.objectContaining({ verdict: 'rejected', item: run.items[1]!.id })]);
    await claude.closes(run, 'created 1, rejected 1');

    await expect(user.page).toHaveTitle(/^✓ /);
    await expect(user.turnLine).toHaveText('Run ended');
    await expect.poll(() => user.favicon()).toBe(FAVICON.done);
    await expect(user.itemComposer).toBeDisabled();
  });

  test('an item left pending can be approved later', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);

    let verdict = claude.waitsForTheUser(run);
    await user.leavesPending();
    expect(await verdict).toEqual([expect.objectContaining({ verdict: 'pending' })]);
    await expect(user.verdictBadge('pending')).toBeVisible();

    verdict = claude.waitsForTheUser(run);
    await user.approves();
    expect(await verdict).toEqual([expect.objectContaining({ verdict: 'approved' })]);
  });

  test('a revision from Claude voids the approval, and the buttons come back for the new one', async ({
    claude,
    user,
  }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    const verdict = claude.waitsForTheUser(run);
    await user.approves();
    await verdict;

    await claude.revises(run, run.items[0]!.id, { tags: ['revised'] });
    await expect(user.page.getByText('Approves exactly rev 2.')).toBeVisible();
    await expect(user.button('Approve')).toBeEnabled();
  });

  test('rejecting shows the item as rejected', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    const verdict = claude.waitsForTheUser(run);
    await user.rejects();
    expect(await verdict).toEqual([expect.objectContaining({ verdict: 'rejected' })]);
    await expect(user.verdictBadge('rejected')).toBeVisible();
  });
});

test.describe('editing the card', () => {
  test('an edited criterion reaches Claude, and the new revision says the user changed it', async ({
    claude,
    user,
  }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    const edit = claude.waitsForTheUser(run);
    await user.editsCriterion('The validator rejects a non-array with a 400');

    expect(await edit).toEqual([
      expect.objectContaining({
        type: 'edit',
        item: run.items[0]!.id,
        path: 'criteria.0.text',
        text: 'The validator rejects a non-array with a 400',
      }),
    ]);
    await expect(user.page.getByText('edited by you · will be re-probed')).toBeVisible();
    await expect(user.page.getByText('Approves exactly rev 2.')).toBeVisible();
  });

  test('the card shows its fields as Claude wrote them', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [plainCard('A card with every field')] });
    await user.opens(run);
    await expect(user.heading('A card with every field')).toBeVisible();
    await expect(user.page.locator('.chip')).toHaveText(['backend', 'bug']);
    await expect(user.page.getByText('The validator guards its own input')).toBeVisible();
    await expect(user.page.locator('code').filter({ hasText: 'officeIds' })).toBeVisible();
  });
});

test.describe('moving between items', () => {
  test('the item on screen and an unsent draft survive a reload', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [plainCard(), plainCard(), plainCard()] });
    await user.opens(run);
    await user.goesToNextItem();
    await user.goesToNextItem();
    await expect(user.heading('Card 3')).toBeVisible();
    await user.itemComposer.fill('a draft I have not sent');

    await user.page.reload();
    await expect(user.heading('Card 3')).toBeVisible();
    await expect(user.itemComposer).toHaveValue('a draft I have not sent');
  });

  test('the progress bar names each item and its state, and jumps to it', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [plainCard(), plainCard()] });
    await user.opens(run);
    const progress = user.page.getByRole('navigation', { name: 'Items in this run' });
    await progress.getByRole('button', { name: 'Card 2: ready' }).click();
    await expect(user.heading('Card 2')).toBeVisible();
  });
});

test.fixme('two runs with the same subject show their start time in the tab title', async () => {
  // Not built yet; the card's criterion stays open until it is.
});
