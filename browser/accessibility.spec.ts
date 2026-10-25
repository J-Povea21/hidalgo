/**
 * Accessibility: axe finds nothing wrong in each state the page can be in, in light
 * and dark, and everything can be done from the keyboard alone.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { cardAsking, plainCard, smallFlow } from './support/data.ts';
import { expect, test } from './support/test.ts';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
/** Past the 60 s after Claude's last tool call during which the page still says it is working. */
const PAST_ACTIVE_WINDOW_MS = 61_000;

async function expectNoViolations(page: Page, state: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const found = violations.map(
    (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
  expect(found, `axe, ${state}`).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe finds nothing, ${colorScheme}`, () => {
    // Fades caught half-way would read as low contrast.
    test.use({ colorScheme, reducedMotion: 'reduce' });

    test('with questions open, an unread message, and the run drawer open', async ({ claude, user }) => {
      const run = await claude.opensRun({ cards: [cardAsking('First?'), plainCard()] });
      await user.opens(run);
      await claude.says(run, run.threadId, 'A note about the **whole** run, with `code`.');
      await expect(user.unreadMark).toBeVisible();
      await expectNoViolations(user.page, 'unread message');
      await user.opensRunDrawer();
      await expect(user.page.getByText('A note about the')).toBeVisible();
      await expectNoViolations(user.page, 'questions and the run drawer');
    });

    test('with everything answered, approved and done', async ({ claude, user }) => {
      const run = await claude.opensRun({ cards: [cardAsking('First?'), plainCard()] });
      await user.opens(run);
      await user.picks('Here');
      await user.sendsAnswers(1);
      await user.approves();
      await expect(user.page.getByText('Approved · rev 1')).toBeVisible();
      await claude.marksDone(run, run.items[0]!.id, 'created 86e3');
      await expect(user.page.getByText('created 86e3')).toBeVisible();
      await expectNoViolations(user.page, 'answered and done');
    });

    test('with each banner: Claude quiet, the run paused, the session ended', async ({ claude, user }) => {
      const run = await claude.opensRun();
      await user.page.clock.install();
      await user.opens(run);
      await user.page.clock.fastForward(PAST_ACTIVE_WINDOW_MS);
      await expect(user.banner("isn't listening")).toBeVisible();
      await expectNoViolations(user.page, 'Claude quiet');
      await claude.pauses(run);
      await expect(user.banner('paused')).toBeVisible();
      await expectNoViolations(user.page, 'paused');
      await claude.ends();
      await expect(user.banner('session ended')).toBeVisible();
      await expectNoViolations(user.page, 'ended');
    });

    test('on a phone, with a diagram, and with the diagram enlarged', async ({ claude, user }) => {
      const run = await claude.opensRun();
      const diagram = await claude.draws(run, smallFlow());
      await user.page.setViewportSize({ width: 390, height: 844 });
      await user.opens(run);
      await user.opensRunDrawer();
      await claude.says(run, run.threadId, `How it flows:\n\n{{diagram:${diagram}}}`);
      await expect(user.page.locator('.diagram svg')).toBeVisible({ timeout: 15_000 });
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
    await user.page.getByLabel(/^Separately/).focus();
    await user.page.keyboard.press('ArrowDown');
    await user.page.keyboard.press('ArrowDown');
    await expect(user.page.getByLabel(/^Neither/)).toBeFocused();
    await expect(user.heading('Question 1 of 2')).toBeVisible();

    await user.page.keyboard.press('Space');
    await expect(user.heading('Question 2 of 2')).toBeVisible();
    await expect(user.page.locator('input[type=radio]:focus')).toHaveCount(1);
    await user.page.keyboard.press('Space');

    const answers = claude.waitsForTheUser(run);
    await user.button('Send 2 answers').focus();
    await user.page.keyboard.press('Enter');
    const [sent] = await answers;
    expect(sent!['answers'].map((answer: { chose: string }) => answer.chose)).toEqual(['Neither', 'Separately']);
  });

  test('Approve works with Enter, and focus lands on the outcome, not the page', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    const verdict = claude.waitsForTheUser(run);
    await user.button('Approve').focus();
    await user.page.keyboard.press('Enter');
    expect(await verdict).toEqual([expect.objectContaining({ verdict: 'approved' })]);
    await expect(user.page.locator('.verdict')).toBeFocused();
  });

  test('the composer: focus it, type, Ctrl/⌘+Enter sends', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    await user.itemComposer.focus();
    await user.page.keyboard.type('from the keyboard');
    const message = claude.waitsForTheUser(run);
    await user.page.keyboard.press('ControlOrMeta+Enter');
    expect(await message).toEqual([expect.objectContaining({ text: 'from the keyboard' })]);
  });

  test('the lightbox opens with Enter, takes focus, and Escape closes it and gives focus back', async ({
    claude,
    user,
  }) => {
    const run = await claude.opensRun();
    const diagram = await claude.draws(run, smallFlow('A', 'B'));
    await user.opens(run);
    await user.opensRunDrawer();
    await claude.says(run, run.threadId, `{{diagram:${diagram}}}`);
    const enlarge = user.button('Open diagram full size');
    await expect(enlarge).toBeVisible({ timeout: 15_000 });

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
    await user.button('Edit').first().focus();
    await user.page.keyboard.press('Enter');
    await expect(user.page.getByLabel('Edit criterion')).toBeFocused();

    await user.page.keyboard.type(' (changed)');
    await user.page.keyboard.press('Escape');
    await expect(user.page.getByLabel('Edit criterion')).toHaveCount(0);
    await expect(user.page.getByText('The validator guards its own input', { exact: true })).toBeVisible();
    await expect(user.button('Edit').first()).toBeFocused();
  });

  test('the run drawer and Next work with Enter', async ({ claude, user }) => {
    const run = await claude.opensRun({ cards: [plainCard(), plainCard()] });
    await user.opens(run);
    await user.button(/^Run/).focus();
    await user.page.keyboard.press('Enter');
    await expect(user.button(/^Run/)).toHaveAttribute('aria-expanded', 'true');
    await user.button('Next →').focus();
    await user.page.keyboard.press('Enter');
    await expect(user.heading('Card 2')).toBeVisible();
  });
});
