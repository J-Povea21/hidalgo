/** The page fits the screen, its buttons can be hit, and animations never cover them. */
import type { Page } from '@playwright/test';
import { expect, plainCard, SCREENS, test } from './support/index.ts';

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

test('with a header long enough to wrap, the item panel never slides under it', async ({ claude, user }) => {
  await user.page.setViewportSize(NARROW_LAPTOP);
  const run = await claude.opensRun({ subject: 'A subject long enough to wrap the header onto two lines here' });
  await user.opens(run);
  await expect(user.items.heading('Card 1')).toBeVisible();

  await user.page.mouse.wheel(0, 600);

  await expect.poll(() => user.page.evaluate(panelIsBelowTheHeader)).toBe(true);
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

/** Runs in the page. */
function panelIsBelowTheHeader(): boolean {
  const header = document.querySelector('header.top')!.getBoundingClientRect();
  const panel = document.querySelector('.sticky')!.getBoundingClientRect();
  return panel.top >= header.bottom - 1;
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
