import type { Locator, Page } from '@playwright/test';

/** Moving between items, and the card on screen. */
export class Items {
  constructor(private readonly page: Page) {}

  /** The item on screen, by its title. */
  heading(title: string): Locator {
    return this.page.getByRole('heading', { name: title });
  }

  async next(): Promise<void> {
    await this.page.getByRole('button', { name: 'Next →' }).click();
  }

  /** The progress bar: one segment per item, named by its title and state. */
  get progress(): Locator {
    return this.page.getByRole('navigation', { name: 'Items in this run' });
  }

  /** Edits the first criterion of the card on screen. */
  async editCriterion(text: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Edit' }).first().click();
    await this.page.getByLabel('Edit criterion').fill(text);
    await this.page.getByRole('button', { name: 'Save edit' }).click();
  }
}
