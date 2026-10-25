/** The side drawers: the whole run's conversation, and the other reviews open on this machine. */
import type { Locator, Page } from '@playwright/test';

export class Drawers {
  constructor(private readonly page: Page) {}

  get runButton(): Locator {
    return this.page.getByRole('button', { name: /^Run/ });
  }

  /** The dot on the Run button when Claude wrote something unread there. */
  get unreadMark(): Locator {
    return this.runButton.getByRole('img', { name: 'new messages' });
  }

  async openRun(): Promise<void> {
    await this.runButton.click();
  }

  async openReviews(): Promise<void> {
    await this.page.getByRole('button', { name: 'Open reviews', exact: true }).click();
  }
}
