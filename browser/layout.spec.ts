/** The page fits the screen, its buttons can be hit, and animations never swallow input. */
import type { Page } from '@playwright/test';
import { expect, openRun, test } from './harness.ts';

/** True if a click at the element's centre would land on the element itself (not on something over it). */
const hittable = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).first().evaluate((el) => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`B-17 at ${viewport.width}×${viewport.height}: no sideways scroll, Approve and Send can be hit`, async ({ page, wb }) => {
    await page.setViewportSize(viewport);
    const { url } = await openRun(wb, [{}, {}]);
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Card 1' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await hittable(page, 'Approve')).toBe(true);
    expect(await hittable(page, 'Send')).toBe(true);
  });
}

test('B-17 with a long subject, the item panel never slides under the header', async ({ page, wb }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  const { url } = await openRun(wb, [{}], 'A subject long enough to wrap the header onto two lines here');
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Card 1' })).toBeVisible();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => {
    const header = document.querySelector('header.top')!.getBoundingClientRect();
    const panel = document.querySelector('.sticky')!.getBoundingClientRect();
    return panel.top >= header.bottom - 1;
  })).toBe(true);
});

test('B-18 while the next item slides in, nothing covers its buttons', async ({ page, wb }) => {
  const { url } = await openRun(wb, [{}, {}]);
  await page.goto(url);
  await page.getByRole('button', { name: 'Next →' }).click();
  // Checked at once, mid-animation: a click where a button is now reaches that button.
  const covered = await page.evaluate(() => {
    if (!document.querySelector('.slide.in-right')) return 'the slide was already over';
    return [...document.querySelectorAll<HTMLButtonElement>('.verdict button, .compose button')].filter((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.top >= 0 && r.bottom <= innerHeight && !(hit === b || b.contains(hit));
    }).map((b) => b.textContent);
  });
  expect(covered).toEqual([]);
});
