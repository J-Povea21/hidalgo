/**
 * Accessibility: axe finds nothing in each state the page can be in, in light
 * and dark, and every action can be done from the keyboard.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, openRun, question, test } from './harness.ts';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function noViolations(page: Page, what: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    violations.map(
      (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
    what,
  ).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${colorScheme}`, () => {
    // Fades would otherwise be caught half-way and read as low contrast.
    test.use({ colorScheme, reducedMotion: 'reduce' });

    test('questions open, run drawer open', async ({ page, wb }) => {
      const { runId, threadId, url } = await openRun(wb, [{ questions: [question] }, {}]);
      await page.goto(url);
      await wb.call('send_message', { runId, threadId, text: 'A note about the **whole** run, with `code`.' });
      await expect(page.getByRole('img', { name: 'new messages' })).toBeVisible();
      await noViolations(page, 'unread dot visible');
      await page.getByRole('button', { name: /^Run/ }).click();
      await expect(page.getByText('A note about the')).toBeVisible();
      await noViolations(page, 'questions and the run drawer');
    });

    test('everything answered, approved and done', async ({ page, wb }) => {
      const { runId, added, url } = await openRun(wb, [{ questions: [question] }, {}]);
      await page.goto(url);
      await page.getByLabel(/^Here/).check();
      await page.getByRole('button', { name: 'Send 1 answer' }).click();
      await page.getByRole('button', { name: 'Approve' }).click();
      await expect(page.getByText('Approved · rev 1')).toBeVisible();
      await wb.call('mark_done', { runId, itemId: added[0]!.id, note: 'created 86e3' });
      await expect(page.getByText('created 86e3')).toBeVisible();
      await noViolations(page, 'answered and done');
    });

    test('banners: paused, idle, ended', async ({ page, wb }) => {
      const { runId, url } = await openRun(wb);
      await page.clock.install();
      await page.goto(url);
      await page.clock.fastForward(61_000);
      await expect(page.locator('.banner').filter({ hasText: "isn't listening" })).toBeVisible();
      await noViolations(page, 'idle');
      await wb.call('close_session', { runId, status: 'paused', outcome: 'later' });
      await expect(page.locator('.banner').filter({ hasText: 'paused' })).toBeVisible();
      await noViolations(page, 'paused');
      await wb.stop();
      await expect(page.locator('.banner').filter({ hasText: 'session ended' })).toBeVisible();
      await noViolations(page, 'ended');
    });

    test('lightbox open, and a narrow screen', async ({ page, wb }) => {
      const { runId, threadId, url } = await openRun(wb);
      const { diagramId: id } = await wb.call('create_diagram', {
        runId,
        spec: {
          type: 'flow',
          nodes: [
            { id: 'a', label: 'Page' },
            { id: 'b', label: 'Server' },
          ],
          edges: [{ from: 'a', to: 'b', label: 'event' }],
        },
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url);
      await page.getByRole('button', { name: /^Run/ }).click();
      await wb.call('send_message', { runId, threadId, text: `How it flows:\n\n{{diagram:${id}}}` });
      await expect(page.locator('.diagram svg')).toBeVisible({ timeout: 15_000 });
      await noViolations(page, 'diagram, 390 px');
      await page.getByRole('button', { name: 'Open diagram full size' }).click();
      await expect(page.getByRole('dialog', { name: 'Enlarged view' })).toBeVisible();
      await noViolations(page, 'lightbox');
    });
  });
}

test.describe('keyboard only', () => {
  test('B-A1 the carousel: arrows move without committing, Space commits, focus follows, Enter sends', async ({
    page,
    wb,
  }) => {
    const { runId, url } = await openRun(wb, [{ questions: [question, { ...question, text: 'Second?' }] }]);
    await page.goto(url);
    await page.getByLabel(/^Separately/).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByLabel(/^Neither/)).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Question 1 of 2' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { name: 'Question 2 of 2' })).toBeVisible();
    await expect(page.locator('input[type=radio]:focus')).toHaveCount(1);
    await page.keyboard.press('Space');
    const waiting = wb.start('wait_for_events', { runId });
    const send = page.getByRole('button', { name: 'Send 2 answers' });
    await send.focus();
    await page.keyboard.press('Enter');
    expect((await waiting).events[0].answers.map((answer: { chose: string }) => answer.chose)).toEqual([
      'Neither',
      'Separately',
    ]);
  });

  test('B-A2 Approve: Enter works, and focus lands on the outcome, not the page', async ({ page, wb }) => {
    const { runId, url } = await openRun(wb);
    await page.goto(url);
    const waiting = wb.start('wait_for_events', { runId });
    await page.getByRole('button', { name: 'Approve' }).focus();
    await page.keyboard.press('Enter');
    expect((await waiting).events[0]).toMatchObject({ verdict: 'approved' });
    await expect(page.locator('.verdict')).toBeFocused();
  });

  test('B-A3 the composer: Tab in, type, Ctrl/⌘+Enter sends', async ({ page, wb }) => {
    const { runId, url } = await openRun(wb);
    await page.goto(url);
    const box = page.getByRole('textbox', { name: 'About this item only.' });
    await box.focus();
    await page.keyboard.type('from the keyboard');
    const waiting = wb.start('wait_for_events', { runId });
    await page.keyboard.press('ControlOrMeta+Enter');
    expect((await waiting).events[0]).toMatchObject({ text: 'from the keyboard' });
  });

  test('B-A4 the lightbox opens from the keyboard, takes focus, Escape closes and gives it back', async ({
    page,
    wb,
  }) => {
    const { runId, threadId, url } = await openRun(wb);
    const { diagramId: id } = await wb.call('create_diagram', {
      runId,
      spec: {
        type: 'flow',
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      },
    });
    await page.goto(url);
    await page.getByRole('button', { name: /^Run/ }).click();
    await wb.call('send_message', { runId, threadId, text: `{{diagram:${id}}}` });
    const open = page.getByRole('button', { name: 'Open diagram full size' });
    await expect(open).toBeVisible({ timeout: 15_000 });
    await open.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Enlarged view' });
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test('B-A5 editing a criterion: focus moves in, Escape cancels and returns to Edit', async ({ page, wb }) => {
    const { url } = await openRun(wb);
    await page.goto(url);
    const edit = page.getByRole('button', { name: 'Edit' }).first();
    await edit.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Edit criterion')).toBeFocused();
    await page.keyboard.type(' (changed)');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Edit criterion')).toHaveCount(0);
    await expect(page.getByText('The validator guards its own input', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeFocused();
  });

  test('B-A6 the run drawer and Next work with Enter', async ({ page, wb }) => {
    const { url } = await openRun(wb, [{}, {}]);
    await page.goto(url);
    const run = page.getByRole('button', { name: /^Run/ });
    await run.focus();
    await page.keyboard.press('Enter');
    await expect(run).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Next →' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Card 2' })).toBeVisible();
  });
});
