/** Images in and out, diagrams drawn or failing gracefully, and quoting the item into its thread. */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, openRun, test } from './harness.ts';

/** Builds a big PNG in the page and hands it to the composer the way a paste or a drop would. */
async function giveImage(page: Page, how: 'paste' | 'drop', width = 3000, height = 2000) {
  await page.evaluate(async ({ how, width, height }) => {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const g = c.getContext('2d')!;
    g.fillStyle = how === 'paste' ? '#c27c0e' : '#2f5bd3';
    g.fillRect(0, 0, width, height);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], `${how}.png`, { type: 'image/png' }));
    const target = how === 'paste' ? document.querySelector('.stage textarea[aria-label="About this item only."]')! : document.querySelector('.stage .composewrap')!;
    target.dispatchEvent(how === 'paste' ? new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }) : new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  }, { how, width, height });
}

/** Width and height of a WebP file, from its header (VP8, VP8L or VP8X). */
function webpSize(b: Buffer): { w: number; h: number } {
  expect(b.subarray(0, 4).toString('latin1')).toBe('RIFF');
  expect(b.subarray(8, 12).toString('latin1')).toBe('WEBP');
  const chunk = b.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}

test('B-10 paste, drop and attach images: shrunk to WebP, at most 5, stored and shown back', async ({ page, wb }) => {
  // Shrinking two 3000×2000 images is real CPU work; under parallel workers it can take a while.
  test.slow();
  const { runId, url } = await openRun(wb);
  await page.goto(url);
  await expect(page.getByLabel('About this item only.')).toBeEnabled();
  const toast = page.getByTestId('toast');

  await giveImage(page, 'paste');
  await expect(toast).toHaveText('1 image attached');
  await giveImage(page, 'drop');
  await expect(page.locator('.stage .thumb')).toHaveCount(2);

  const chooser = page.waitForEvent('filechooser');
  await page.locator('.stage').getByRole('button', { name: 'Attach images' }).click();
  // A 1×1 PNG.
  const tiny = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  await (await chooser).setFiles(['a', 'b', 'c', 'd'].map((n) => ({ name: `${n}.png`, mimeType: 'image/png', buffer: tiny })));
  await expect(toast).toHaveText('Attached 3; up to 5 per message');
  await expect(page.locator('.stage .thumb')).toHaveCount(5);

  await page.getByLabel('About this item only.').fill('see these');
  const w = wb.start('wait_for_events', { runId });
  await page.locator('.stage').getByRole('button', { name: 'Send', exact: true }).click();
  const [ev] = (await w).events;
  expect(ev.text).toBe('see these');
  // The pasted, dropped and attached tiny images: identical tiny ones are stored once.
  expect(ev.images.length).toBeGreaterThanOrEqual(3);
  const big = webpSize(readFileSync(ev.images[0]));
  expect(Math.max(big.w, big.h)).toBe(1500);

  const shown = page.locator('.stage .msg.user').getByRole('button', { name: 'Attached image. Open full size' }).first();
  await expect(shown).toBeVisible();
  expect(await shown.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await shown.click();
  await expect(page.getByRole('dialog', { name: 'Enlarged view' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('B-12 a diagram loads Mermaid only when shown, draws, and opens full size', async ({ page, wb }) => {
  const { runId, threadId, url } = await openRun(wb);
  const mermaid: string[] = [];
  page.on('request', (r) => { if (/mermaid/i.test(r.url())) mermaid.push(r.url()); });
  await page.goto(url);
  await page.getByRole('button', { name: /^Run/ }).click();
  expect(mermaid).toEqual([]);

  const { diagramId } = await wb.call('create_diagram', { runId, spec: { type: 'flow', nodes: [{ id: 'p', label: 'Page "quoted" <b>' }, { id: 's', label: 'Server' }], edges: [{ from: 'p', to: 's', label: 'event' }] } });
  await wb.call('send_message', { runId, threadId, text: `Here:\n\n{{diagram:${diagramId}}}` });
  await expect(page.locator('.drawer .diagram svg')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Drawing diagram…')).toHaveCount(0);
  expect(mermaid.length).toBeGreaterThan(0);

  await page.locator('.drawer .diagram svg').click();
  await expect(page.getByRole('dialog', { name: 'Enlarged view' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('B-12 a diagram that fails to draw shows its outline and tells Claude, once', async ({ page, wb }) => {
  const { runId, threadId, url } = await openRun(wb);
  await page.route(/mermaid\.core-[^/]*\.js$/, (r) => r.fulfill({ contentType: 'text/javascript', body: "throw new Error('boom')" }));
  await page.goto(url);
  await page.getByRole('button', { name: /^Run/ }).click();
  const { diagramId } = await wb.call('create_diagram', { runId, spec: { type: 'flow', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] } });
  await wb.call('send_message', { runId, threadId, text: `{{diagram:${diagramId}}}` });
  await expect(page.getByLabel('Diagram as text')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/boom/)).toHaveCount(0);

  const { events } = await wb.call('wait_for_events', { runId });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: 'diagram-failed', error: expect.stringMatching(new RegExp(`diagram ${diagramId} failed to draw`)) });
});

test('B-13 "Ask about this" quotes the selected text into the item\'s conversation', async ({ page, wb }) => {
  const { url } = await openRun(wb);
  await page.goto(url);
  const target = page.locator('.preview .ac li .txt').first();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Ask about this' }).click();
  const composer = page.getByLabel('About this item only.');
  await expect(composer).toHaveValue(/^> .*validator/);
  await expect(composer).toBeFocused();
  await expect(page.getByTestId('toast')).toHaveText("Quoted into this item's conversation");
});

test('B-13 a keyboard selection offers it too', async ({ page, wb }) => {
  const { url } = await openRun(wb);
  await page.goto(url);
  await page.locator('.preview .ac li .txt').first().evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByRole('button', { name: 'Ask about this' })).toBeVisible();
});
