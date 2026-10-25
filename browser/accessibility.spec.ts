/**
 * Accessibility: axe finds nothing wrong in each state the page can be in, in light
 * and dark, and everything can be done from the keyboard alone.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import {
  cardAsking,
  DIAGRAM_DRAWN,
  expect,
  PAST_ACTIVE_WINDOW_MS,
  plainCard,
  SCREENS,
  smallFlow,
  test,
  WCAG,
} from './support/index.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe finds nothing, ${colorScheme}`, () => {
    // Fades caught half-way would read as low contrast.
    test.use({ colorScheme, reducedMotion: 'reduce' });

    test('with questions open, an unread message, and the run drawer open', async ({ claude, user }) => {
      const run = await claude.opensRun({ cards: [cardAsking('First?'), plainCard()] });
      await user.opens(run);

      await run.say(run.threadId, 'A note about the **whole** run, with `code`.');
      await expect(user.drawers.unreadMark).toBeVisible();

      await expectNoViolations(user.page, 'unread message');

      await user.drawers.openRun();
      await expect(user.page.getByText('A note about the')).toBeVisible();

      await expectNoViolations(user.page, 'questions and the run drawer');
    });

    test('with everything answered, approved and done', async ({ claude, user }) => {
      const run = await claude.opensRun({ cards: [cardAsking('First?'), plainCard()] });
      await user.opens(run);
      await user.questions.pick('Here');
      await user.questions.send(1);
      await user.verdict.approve();
      await expect(user.page.getByText('Approved · rev 1')).toBeVisible();

      await run.markDone(run.items[0]!.id, 'created 86e3');
      await expect(user.page.getByText('created 86e3')).toBeVisible();

      await expectNoViolations(user.page, 'answered and done');
    });

    test('with each banner: Claude quiet, the run paused, the session ended', async ({ claude, user }) => {
      const run = await claude.opensRun();
      await user.page.clock.install();
      await user.opens(run);

      await user.page.clock.fastForward(PAST_ACTIVE_WINDOW_MS);
      await expect(user.status.banner("isn't listening")).toBeVisible();

      await expectNoViolations(user.page, 'Claude quiet');

      await run.pause();
      await expect(user.status.banner('paused')).toBeVisible();

      await expectNoViolations(user.page, 'paused');

      await claude.ends();
      await expect(user.status.banner('session ended')).toBeVisible();

      await expectNoViolations(user.page, 'ended');
    });

    test('on a phone, with a diagram, and with the diagram enlarged', async ({ claude, user }) => {
      const run = await claude.opensRun();
      const diagram = await run.draw(smallFlow());
      await user.page.setViewportSize(SCREENS.phone);
      await user.opens(run);
      await user.drawers.openRun();

      await run.say(run.threadId, `How it flows:\n\n{{diagram:${diagram}}}`);
      await expect(user.page.locator('.diagram svg')).toBeVisible(DIAGRAM_DRAWN);

      await expectNoViolations(user.page, 'diagram, phone width');

      await user.button('Open diagram full size').click();
      await expect(user.page.getByRole('dialog', { name: 'Enlarged view' })).toBeVisible();

      await expectNoViolations(user.page, 'lightbox');
    });
  });
}

test.describe('with the keyboard alone', () => {
  test('in the questions, arrows move without committing, Space commits and focus follows, Enter sends', async ({
    claude,
    user,
  }) => {
    const run = await claude.opensRun({ cards: [cardAsking('First?', 'Second?')] });
    await user.opens(run);
    await user.questions.option('Separately').focus();

    await user.page.keyboard.press('ArrowDown');
    await user.page.keyboard.press('ArrowDown');

    await expect(user.questions.option('Neither')).toBeFocused();
    await expect(user.questions.heading(1, 2)).toBeVisible();

    await user.page.keyboard.press('Space');

    await expect(user.questions.heading(2, 2)).toBeVisible();
    await expect(user.page.locator('input[type=radio]:focus')).toHaveCount(1);

    await user.page.keyboard.press('Space');
    const answers = run.waitForTheUser();
    await user.questions.sendButton(2).focus();
    await user.page.keyboard.press('Enter');
    const [sent] = await answers;

    expect(sent!['answers'].map((answer: { chose: string }) => answer.chose)).toEqual(['Neither', 'Separately']);
  });

  test('Approve works with Enter, and focus lands on the outcome, not the page', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);

    const approval = run.waitForTheUser();
    await user.verdict.approveButton.focus();
    await user.page.keyboard.press('Enter');

    expect(await approval).toEqual([expect.objectContaining({ verdict: 'approved' })]);
    await expect(user.verdict.area).toBeFocused();
  });

  test('the composer: focus it, type, Ctrl/⌘+Enter sends', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    await user.thread.composer.focus();
    await user.page.keyboard.type('from the keyboard');

    const message = run.waitForTheUser();
    await user.page.keyboard.press('ControlOrMeta+Enter');

    expect(await message).toEqual([expect.objectContaining({ text: 'from the keyboard' })]);
  });

  test('the lightbox opens with Enter, takes focus, and Escape closes it and gives focus back', async ({
    claude,
    user,
  }) => {
    const run = await claude.opensRun();
    const diagram = await run.draw(smallFlow('A', 'B'));
    await user.opens(run);
    await user.drawers.openRun();
    await run.say(run.threadId, `{{diagram:${diagram}}}`);
    const enlarge = user.button('Open diagram full size');
    await expect(enlarge).toBeVisible(DIAGRAM_DRAWN);

    await enlarge.focus();
    await user.page.keyboard.press('Enter');

    const dialog = user.page.getByRole('dialog', { name: 'Enlarged view' });
    await expect(dialog).toBeFocused();

    await user.page.keyboard.press('Escape');

    await expect(dialog).toHaveCount(0);
    await expect(enlarge).toBeFocused();
  });

  test('editing a criterion: focus moves in, Escape cancels and returns focus to Edit', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    const edit = user.page.getByRole('button', { name: 'Edit' }).first();

    await edit.focus();
    await user.page.keyboard.press('Enter');

    await expect(user.page.getByLabel('Edit criterion')).toBeFocused();

    await user.page.keyboard.type(' (changed)');
    await user.page.keyboard.press('Escape');

    await expect(user.page.getByLabel('Edit criterion')).toHaveCount(0);
    await expect(user.page.getByText('The validator guards its own input', { exact: true })).toBeVisible();
    await expect(edit).toBeFocused();
  });

  test('the run drawer and Next work with Enter', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [plainCard(), plainCard()] });
    await user.opens(run);

    await user.drawers.runButton.focus();
    await user.page.keyboard.press('Enter');

    await expect(user.drawers.runButton).toHaveAttribute('aria-expanded', 'true');

    await user.button('Next →').focus();
    await user.page.keyboard.press('Enter');

    await expect(user.items.heading('Card 2')).toBeVisible();
  });
});

async function expectNoViolations(page: Page, state: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const found = violations.map(
    (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
  expect(found, `axe, ${state}`).toEqual([]);
}
