/** What the page says about itself: whose turn, how it's connected, banners, toasts, and the tab. */
import type { Locator, Page } from '@playwright/test';

export class Status {
  constructor(private readonly page: Page) {}

  /** The turn line in the header. */
  get turnLine(): Locator {
    return this.page.locator('[data-turn]');
  }

  /** Whose turn the page shows: yours, working, idle, done or offline. */
  turn(): Promise<string | null> {
    return this.turnLine.getAttribute('data-turn');
  }

  /** How the page says it is connected: live, reconnecting, lost, ended, moved, stale or connecting. */
  connection(): Promise<string | null> {
    return this.page.locator('html').getAttribute('data-connection');
  }

  /** The banner across the top that says `text`. */
  banner(text: string | RegExp): Locator {
    return this.page.locator('.banner').filter({ hasText: text });
  }

  /** An alert (a banner that interrupts a screen reader) that says `text`. */
  alert(text: string | RegExp): Locator {
    return this.page.getByRole('alert').filter({ hasText: text });
  }

  get toast(): Locator {
    return this.page.getByTestId('toast');
  }

  /** The colour of the tab's favicon dot, read from its centre pixel. */
  favicon(): Promise<string> {
    return this.page.evaluate(readFaviconColour);
  }
}

/** Runs in the page. */
async function readFaviconColour(): Promise<string> {
  const href = document.querySelector<HTMLLinkElement>('link[rel=icon]')?.href;
  if (!href) {
    return 'none';
  }
  const image = new Image();
  image.src = href;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = image.width;
  const drawing = canvas.getContext('2d')!;
  drawing.drawImage(image, 0, 0);
  const centre = image.width / 2;
  const [red, green, blue] = drawing.getImageData(centre, centre, 1, 1).data;
  return `#${[red, green, blue].map((channel) => channel!.toString(16).padStart(2, '0')).join('')}`;
}
