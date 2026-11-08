import type { Locator, Page } from '@playwright/test';
import { Drawers } from './drawers.ts';
import { Items } from './items.ts';
import { Questions } from './questions.ts';
import { Status } from './status.ts';
import { COMPOSER, Thread } from './thread.ts';
import { Verdict } from './verdict.ts';

/**
 * The user's side of a browser test: the real page, through what a person sees and does.
 * Each part of the page has its own object (support/user/*.ts), so a new feature of the
 * page is a new part, not more methods here. Locators find things by role and accessible
 * name, so a test that passes also proves the page works for a screen reader.
 */
export class UserInPage {
  readonly status: Status;
  readonly questions: Questions;
  readonly verdict: Verdict;
  readonly items: Items;
  readonly drawers: Drawers;
  /** The conversation about the item on screen. */
  readonly thread: Thread;
  /** The whole run's conversation, in the Run drawer. */
  readonly runThread: Thread;

  constructor(readonly page: Page) {
    this.status = new Status(page);
    this.questions = new Questions(page);
    this.verdict = new Verdict(page);
    this.items = new Items(page);
    this.drawers = new Drawers(page);
    this.thread = new Thread(page, COMPOSER.item);
    this.runThread = new Thread(page, COMPOSER.run);
  }

  /** Opens a run's page (or any address). */
  async opens(target: { url: string } | string): Promise<void> {
    await this.page.goto(typeof target === 'string' ? target : target.url);
  }

  button(name: string | RegExp): Locator {
    return this.page.getByRole('button', { name, exact: typeof name === 'string' });
  }
}
