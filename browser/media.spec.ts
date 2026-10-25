/** Images in and out of a conversation, and diagrams: drawn, enlarged, or failing gracefully. */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { smallFlow } from './support/data.ts';
import { expect, test } from './support/test.ts';

/** A 1×1 PNG. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);
/** Images are shrunk to this many pixels on their long side before they're sent. */
const LONG_EDGE = 1500;

/** Draws a big PNG in the page and hands it to the item composer the way a paste or a drop would. */
async function handsOverImage(page: Page, how: 'paste' | 'drop') {
  // Runs in the page: it gets its arguments as data, under its own names.
  await page.evaluate(async (source) => {
    const canvas = document.createElement('canvas');
    canvas.width = 3000;
    canvas.height = 2000;
    const drawing = canvas.getContext('2d')!;
    // A different colour each way, so the two images aren't stored as one.
    drawing.fillStyle = source === 'paste' ? '#c27c0e' : '#2f5bd3';
    drawing.fillRect(0, 0, 3000, 2000);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((drawn) => resolve(drawn!), 'image/png'));
    const files = new DataTransfer();
    files.items.add(new File([blob], `${source}.png`, { type: 'image/png' }));
    const composer = document.querySelector('.stage textarea[aria-label="About this item only."]')!;
    const target = source === 'paste' ? composer : document.querySelector('.stage .composewrap')!;
    const event =
      source === 'paste'
        ? new ClipboardEvent('paste', { clipboardData: files, bubbles: true })
        : new DragEvent('drop', { dataTransfer: files, bubbles: true });
    target.dispatchEvent(event);
  }, how);
}

/** Width and height of a WebP file, from its header (VP8, VP8L or VP8X). */
function webpSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
  const chunk = bytes.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8X') {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
}

test('pasted, dropped and attached images are shrunk to WebP, capped at 5, stored, and shown back', async ({
  claude,
  user,
}) => {
  // Shrinking two 3000×2000 images is real CPU work; under parallel workers it can take a while.
  test.slow();
  const run = await claude.opensRun();
  await user.opens(run);
  await expect(user.itemComposer).toBeEnabled();

  await handsOverImage(user.page, 'paste');
  await expect(user.toast).toHaveText('1 image attached');
  await handsOverImage(user.page, 'drop');
  await expect(user.page.locator('.stage .thumb')).toHaveCount(2);

  const chooser = user.page.waitForEvent('filechooser');
  await user.page.locator('.stage').getByRole('button', { name: 'Attach images' }).click();
  const fourMore = ['a', 'b', 'c', 'd'].map((name) => ({
    name: `${name}.png`,
    mimeType: 'image/png',
    buffer: TINY_PNG,
  }));
  await (await chooser).setFiles(fourMore);
  await expect(user.toast).toHaveText('Attached 3; up to 5 per message');
  await expect(user.page.locator('.stage .thumb')).toHaveCount(5);

  await user.itemComposer.fill('see these');
  const message = claude.waitsForTheUser(run);
  await user.page.locator('.stage').getByRole('button', { name: 'Send', exact: true }).click();
  const [sent] = await message;
  expect(sent!['text']).toBe('see these');
  // Identical tiny images are stored once, so Claude gets at least the two big ones and one tiny one.
  expect(sent!['images'].length).toBeGreaterThanOrEqual(3);
  const big = webpSize(readFileSync(sent!['images'][0]));
  expect(Math.max(big.width, big.height)).toBe(LONG_EDGE);

  const shown = user.page
    .locator('.stage .msg.user')
    .getByRole('button', { name: 'Attached image. Open full size' })
    .first();
  await expect(shown).toBeVisible();
  expect(await shown.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await shown.click();
  await expect(user.page.getByRole('dialog', { name: 'Enlarged view' })).toBeVisible();
  await user.page.keyboard.press('Escape');
  await expect(user.page.getByRole('dialog')).toHaveCount(0);
});

test('Mermaid loads only when a diagram is shown; the diagram draws and opens full size', async ({ claude, user }) => {
  const run = await claude.opensRun();
  const mermaidRequests: string[] = [];
  user.page.on('request', (request) => {
    if (/mermaid/i.test(request.url())) {
      mermaidRequests.push(request.url());
    }
  });
  await user.opens(run);
  await user.opensRunDrawer();
  expect(mermaidRequests).toEqual([]);

  const diagram = await claude.draws(run, smallFlow('Page "quoted" <b>', 'Server'));
  await claude.says(run, run.threadId, `Here:\n\n{{diagram:${diagram}}}`);
  await expect(user.page.locator('.drawer .diagram svg')).toBeVisible({ timeout: 15_000 });
  await expect(user.page.getByText('Drawing diagram…')).toHaveCount(0);
  expect(mermaidRequests.length).toBeGreaterThan(0);

  await user.page.locator('.drawer .diagram svg').click();
  await expect(user.page.getByRole('dialog', { name: 'Enlarged view' })).toBeVisible();
  await user.page.keyboard.press('Escape');
  await expect(user.page.getByRole('dialog')).toHaveCount(0);
});

test('a diagram that fails to draw shows its outline, never an error, and tells Claude once', async ({
  claude,
  user,
}) => {
  const run = await claude.opensRun();
  await user.page.route(/mermaid\.core-[^/]*\.js$/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: "throw new Error('boom')" }),
  );
  await user.opens(run);
  await user.opensRunDrawer();
  const diagram = await claude.draws(run, smallFlow());
  await claude.says(run, run.threadId, `{{diagram:${diagram}}}`);

  await expect(user.page.getByLabel('Diagram as text')).toBeVisible({ timeout: 15_000 });
  await expect(user.page.getByText(/boom/)).toHaveCount(0);
  const reported = await claude.waitsForTheUser(run);
  expect(reported).toEqual([
    expect.objectContaining({
      type: 'diagram-failed',
      error: expect.stringContaining(`diagram ${diagram} failed to draw`),
    }),
  ]);
});
