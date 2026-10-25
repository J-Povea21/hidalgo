/** The page fits the screen, its buttons can be hit, and animations never cover them. */
import type { Page } from '@playwright/test';
import { expect, plainCard, SCREENS, test } from './support/index.ts';

/** The space between the header and the stuck item panel (client/ui/styles.css, `.sticky`). */
const PANEL_GAP_PX = 12;

/** Narrow enough that a long subject wraps the header onto two lines. */
const NARROW_LAPTOP = { width: 1000, height: 700 };

for (const [name, screen] of Object.entries(SCREENS)) {
  test(`on a ${name}, nothing scrolls sideways and Approve and Send can be hit`, async ({ claude, user }) => {
    await user.page.setViewportSize(screen);
    const run = await claude.opensRun({ cards: [plainCard(), plainCard()] });

    await user.opens(run);

    await expect(user.items.heading('Card 1')).toBeVisible();
    expect(await user.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await canBeClicked(user.page, 'Approve')).toBe(true);
    expect(await canBeClicked(user.page, 'Send')).toBe(true);
  });
}

test('the item panel sticks just below the header, however tall the header is', async ({ claude, user }) => {
  await user.page.setViewportSize(NARROW_LAPTOP);
  const run = await claude.opensRun({ subject: 'A subject long enough to wrap the header onto two lines here' });
  await user.opens(run);
  await expect(user.items.heading('Card 1')).toBeVisible();

  await expect.poll(() => user.page.evaluate(stickyGapBelowHeader)).toBeCloseTo(PANEL_GAP_PX, 0);
});

test('while the next item slides in, nothing covers its buttons', async ({ claude, user }) => {
  const run = await claude.opensRun({ cards: [plainCard(), plainCard()] });
  await user.opens(run);

  await user.items.next();
  // Checked at once, mid-animation: a click where a button is now reaches that button.
  const covered = await user.page.evaluate(buttonsCoveredMidSlide);

  expect(covered).toEqual([]);
});

/** True if a click at the button's centre lands on the button itself, not on something over it. */
function canBeClicked(page: Page, name: string): Promise<boolean> {
  return page.getByRole('button', { name, exact: true }).first().evaluate(isHitAtItsCentre);
}

/** Runs in the page. */
function isHitAtItsCentre(button: Element): boolean {
  button.scrollIntoView({ block: 'center' });
  const rect = button.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return hit !== null && (hit === button || button.contains(hit));
}

/**
 * Runs in the page: how far below the header's bottom the panel sticks. Its offset is checked,
 * not where it is now: once its column ends, the panel rightly scrolls away with it.
 */
function stickyGapBelowHeader(): number {
  const headerHeight = document.querySelector('header.top')!.getBoundingClientRect().height;
  const stickyTop = parseFloat(getComputedStyle(document.querySelector('.sticky')!).top);
  return stickyTop - headerHeight;
}

/** Runs in the page: the labels of visible buttons that something covers while the slide plays. */
function buttonsCoveredMidSlide(): string[] | 'the slide was already over' {
  if (!document.querySelector('.slide.in-right')) {
    return 'the slide was already over';
  }
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.verdict button, .compose button')];
  return buttons
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      const onScreen = rect.top >= 0 && rect.bottom <= innerHeight;
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return onScreen && !(hit === button || button.contains(hit));
    })
    .map((button) => button.textContent ?? '');
}
