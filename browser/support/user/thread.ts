/** One conversation: its composer, and the messages in it. */
import type { Locator, Page } from '@playwright/test';

/** Each conversation's composer is named by its hint. */
export const COMPOSER = {
  item: 'About this item only.',
  run: 'About anything that spans the items.',
} as const;

export class Thread {
  constructor(
    private readonly page: Page,
    private readonly composerName: string,
  ) {}

  get composer(): Locator {
    return this.page.getByLabel(this.composerName);
  }

  /** Writes and sends with Ctrl/⌘+Enter. */
  async write(text: string): Promise<void> {
    await this.composer.fill(text);
    await this.composer.press('ControlOrMeta+Enter');
  }

  /** Messages from Claude in the conversations on screen. */
  get claudeMessages(): Locator {
    return this.page.locator('.msg.claude');
  }

  /** The "Claude is thinking…" line under the messages. */
  get thinking(): Locator {
    return this.page.getByText('Claude is thinking…');
  }
}
