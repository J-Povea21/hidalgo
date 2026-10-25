/**
 * The user's side of a browser test: the real page, through what a person sees and
 * does. Locators find things by role and accessible name, so a test that passes here
 * also proves the page works with a screen reader's view of it.
 */
import type { Locator, Page } from '@playwright/test';
import type { Run } from './claude.ts';

/** The favicon dot's colour per turn (client/features/tab/useTab.ts). */
export const FAVICON = { yours: '#c27c0e', working: '#2f5bd3', idle: '#9b9a94', done: '#1f7a4d', offline: '#9b9a94' };

/** The composer of the item on screen, and of the whole-run drawer. */
const ITEM_COMPOSER = 'About this item only.';
const RUN_COMPOSER = 'About anything that spans the items.';

export class UserInPage {
  constructor(readonly page: Page) {}

  async opens(target: Run | string): Promise<void> {
    await this.page.goto(typeof target === 'string' ? target : target.url);
  }

  // ---- what the page says ----

  /** Whose turn the page shows (`data-turn`): yours, working, idle, done or offline. */
  turn(): Promise<string | null> {
    return this.page.locator('[data-turn]').getAttribute('data-turn');
  }

  /** How the page says it is connected (`data-connection`): live, reconnecting, lost, ended, moved, stale… */
  connection(): Promise<string | null> {
    return this.page.locator('html').getAttribute('data-connection');
  }

  get turnLine(): Locator {
    return this.page.locator('[data-turn]');
  }

  /** A banner across the top that says `text`. */
  banner(text: string | RegExp): Locator {
    return this.page.locator('.banner').filter({ hasText: text });
  }

  get toast(): Locator {
    return this.page.getByTestId('toast');
  }

  heading(name: string | RegExp): Locator {
    return this.page.getByRole('heading', { name });
  }

  button(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name, exact: typeof name === 'string' });
  }

  /** The item's outcome badge, next to the verdict buttons: rejected, pending, approved… */
  verdictBadge(status: string): Locator {
    return this.page.locator(`.verdict .badge.${status}`);
  }

  get itemComposer(): Locator {
    return this.page.getByLabel(ITEM_COMPOSER);
  }

  get runComposer(): Locator {
    return this.page.getByLabel(RUN_COMPOSER);
  }

  /** Messages from Claude in the conversations on screen. */
  get claudeMessages(): Locator {
    return this.page.locator('.msg.claude');
  }

  get unreadMark(): Locator {
    return this.button(/^Run/).getByRole('img', { name: 'new messages' });
  }

  /** The colour of the tab's favicon dot, read from its centre pixel. */
  favicon(): Promise<string> {
    return this.page.evaluate(async () => {
      const href = document.querySelector<HTMLLinkElement>('link[rel=icon]')?.href;
      if (!href) return 'none';
      const image = new Image();
      image.src = href;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const drawing = canvas.getContext('2d')!;
      drawing.drawImage(image, 0, 0);
      const [red, green, blue] = drawing.getImageData(16, 16, 1, 1).data;
      return `#${[red, green, blue].map((channel) => channel!.toString(16).padStart(2, '0')).join('')}`;
    });
  }

  // ---- what the user does ----

  /** Picks the option whose label starts with `label` in the question on screen. */
  async picks(label: string): Promise<void> {
    await this.page.getByLabel(new RegExp(`^${label}`)).check();
  }

  async notes(text: string): Promise<void> {
    await this.page.getByLabel('Note for Claude (optional)').fill(text);
  }

  async sendsAnswers(count: number): Promise<void> {
    await this.button(`Send ${count} answer${count === 1 ? '' : 's'}`).click();
  }

  async approves(): Promise<void> {
    await this.button('Approve').click();
  }

  async rejects(): Promise<void> {
    await this.button('Reject').click();
  }

  async leavesPending(): Promise<void> {
    await this.button('Leave pending').click();
  }

  async goesToNextItem(): Promise<void> {
    await this.button('Next →').click();
  }

  /** Writes in the item's conversation and sends with Ctrl/⌘+Enter. */
  async writes(text: string, composer: Locator = this.itemComposer): Promise<void> {
    await composer.fill(text);
    await composer.press('ControlOrMeta+Enter');
  }

  async opensRunDrawer(): Promise<void> {
    await this.button(/^Run/).click();
  }

  async opensReviews(): Promise<void> {
    await this.button('Open reviews').click();
  }

  async editsCriterion(text: string): Promise<void> {
    await this.button('Edit').first().click();
    await this.page.getByLabel('Edit criterion').fill(text);
    await this.button('Save edit').click();
  }
}
