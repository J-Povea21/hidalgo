/** The page fits the screen, its buttons can be hit, and animations never cover them. */
import type { Page } from '@playwright/test';
import { plainCard } from './support/data.ts';
import { expect, test } from './support/test.ts';

/** True if a click at the button's centre lands on the button itself, not on something over it. */
const canBeClicked = (page: Page, name: string) =>
  page
    .getByRole('button', { name, exact: true })
    .first()
    .evaluate((button) => {
      button.scrollIntoView({ block: 'center' });
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return !!hit && (hit === button || button.contains(hit));
    });

const SCREENS = [
  { name: 'a laptop', width: 1280, height: 800 },
  { name: 'a phone', width: 390, height: 844 },
];

for (const screen of SCREENS) {
  test(`on ${screen.name}, nothing scrolls sideways and Approve and Send can be hit`, async ({ claude, user }) => {
    await user.page.setViewportSize(screen);
    const run = await claude.opensRun({ cards: [plainCard(), plainCard()] });
    await user.opens(run);
    await expect(user.heading('Card 1')).toBeVisible();
    expect(await user.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await canBeClicked(user.page, 'Approve')).toBe(true);
    expect(await canBeClicked(user.page, 'Send')).toBe(true);
  });
}

test('with a header long enough to wrap, the item panel never slides under it', async ({ claude, user }) => {
  await user.page.setViewportSize({ width: 1000, height: 700 });
  const run = await claude.opensRun({ subject: 'A subject long enough to wrap the header onto two lines here' });
  await user.opens(run);
  await expect(user.heading('Card 1')).toBeVisible();
  await user.page.mouse.wheel(0, 600);
  const panelBelowHeader = () =>
    user.page.evaluate(() => {
      const header = document.querySelector('header.top')!.getBoundingClientRect();
      const panel = document.querySelector('.sticky')!.getBoundingClientRect();
      return panel.top >= header.bottom - 1;
    });
  await expect.poll(panelBelowHeader).toBe(true);
});

test('while the next item slides in, nothing covers its buttons', async ({ claude, user }) => {
  const run = await claude.opensRun({ cards: [plainCard(), plainCard()] });
  await user.opens(run);
  await user.goesToNextItem();
  // Checked at once, mid-animation: a click where a button is now reaches that button.
  const covered = await user.page.evaluate(() => {
    if (!document.querySelector('.slide.in-right')) {
      return 'the slide was already over';
    }
    return [...document.querySelectorAll<HTMLButtonElement>('.verdict button, .compose button')]
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return rect.top >= 0 && rect.bottom <= innerHeight && !(hit === button || button.contains(hit));
      })
      .map((button) => button.textContent);
  });
  expect(covered).toEqual([]);
});
