/** The questions carousel: picking options, adding a note, sending the answers. */
import type { Locator, Page } from '@playwright/test';

export class Questions {
  constructor(private readonly page: Page) {}

  /** The option whose label starts with `label`, in the question on screen. */
  option(label: string): Locator {
    return this.page.getByLabel(new RegExp(`^${label}`));
  }

  /** The heading that says which question is on screen: "Question 1 of 2". */
  heading(position: number, of: number): Locator {
    return this.page.getByRole('heading', { name: `Question ${position} of ${of}` });
  }

  /** Picks an option with the mouse; the next question comes in on its own. */
  async pick(label: string): Promise<void> {
    await this.option(label).check();
  }

  async note(text: string): Promise<void> {
    await this.page.getByLabel('Note for Claude (optional)').fill(text);
  }

  sendButton(count: number): Locator {
    return this.page.getByRole('button', { name: `Send ${count} answer${count === 1 ? '' : 's'}`, exact: true });
  }

  async send(count: number): Promise<void> {
    await this.sendButton(count).click();
  }

  /** Shown once every question on the item is answered. */
  get allAnswered(): Locator {
    return this.page.getByText('Nothing left to decide on this item');
  }
}
