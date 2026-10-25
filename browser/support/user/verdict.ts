import type { Locator, Page } from '@playwright/test';
import type { BadgeStatus } from '../types.ts';

/** Approve, Reject, Leave pending, and the outcome the item shows afterwards. */
export class Verdict {
  constructor(private readonly page: Page) {}

  get approveButton(): Locator {
    return this.button('Approve');
  }

  async approve(): Promise<void> {
    await this.approveButton.click();
  }

  async reject(): Promise<void> {
    await this.button('Reject').click();
  }

  async leavePending(): Promise<void> {
    await this.button('Leave pending').click();
  }

  /** The item's outcome badge, next to the verdict buttons. */
  badge(status: BadgeStatus): Locator {
    return this.page.locator(`.verdict .badge.${status}`);
  }

  /** The line under the buttons: what Approve would approve. */
  approves(rev: number): Locator {
    return this.page.getByText(`Approves exactly rev ${rev}.`);
  }

  /** The area holding the buttons, or the outcome once decided. */
  get area(): Locator {
    return this.page.locator('.verdict');
  }

  private button(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }
}
