/** Talking with Claude: the item's thread, the whole-run thread, quoting the card, and what Markdown may do. */
import { expect, test } from './support/index.ts';

const HOSTILE_MARKDOWN = [
  'img <img src=x onerror="window.__ran=1">',
  '[a link](javascript:window.__ran=2)',
  '<svg><script>window.__ran=3</script></svg>',
  '<math><mtext><table><mglyph><style><img src=x onerror="window.__ran=4">',
].join(' and ');

test('a message sent with Ctrl/⌘+Enter reaches Claude, Enter alone is a new line, and the reply shows', async ({
  claude,
  user,
}) => {
  const run = await claude.opensRun();
  await user.opens(run);
  await user.thread.composer.fill('first line');
  await user.thread.composer.press('Enter');
  await user.thread.composer.pressSequentially('second line');

  const message = run.waitForTheUser();
  await user.thread.composer.press('ControlOrMeta+Enter');
  const [sent] = await message;

  expect(sent).toMatchObject({ type: 'message', item: run.items[0]!.id, text: 'first line\nsecond line' });
  await expect(user.thread.composer).toHaveValue('');
  await expect(user.thread.composer).toBeFocused();

  await run.reply(sent!, 'Got it.');

  await expect(user.thread.claudeMessages.filter({ hasText: 'Got it.' })).toBeVisible();
});

test('Claude can start a conversation in the run thread; it shows as unread until opened', async ({ claude, user }) => {
  const run = await claude.opensRun();
  await user.opens(run);

  await run.say(run.threadId, 'A note on the whole run.');

  await expect(user.drawers.unreadMark).toBeVisible();

  await user.drawers.openRun();

  await expect(user.drawers.runButton).toHaveAttribute('aria-expanded', 'true');
  await expect(user.page.getByText('A note on the whole run.')).toBeVisible();
  await expect(user.drawers.unreadMark).toHaveCount(0);
});

test('while Claude works on a message its thread says so, and it stops once Claude listens again', async ({
  claude,
  user,
}) => {
  const run = await claude.opensRun();
  await user.opens(run);
  const message = run.waitForTheUser();

  await user.thread.write('over to you');
  await message;

  await expect(user.thread.thinking).toBeVisible();

  run.waitForTheUser();

  await expect(user.thread.thinking).toHaveCount(0);
});

test.describe('"Ask about this"', () => {
  test('quotes text selected with the mouse into the item thread', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    const criterion = user.page.locator('.preview .ac li .txt').first();
    const box = (await criterion.boundingBox())!;
    await user.page.mouse.move(box.x + 2, box.y + box.height / 2);
    await user.page.mouse.down();
    await user.page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
    await user.page.mouse.up();

    await user.button('Ask about this').click();

    await expect(user.thread.composer).toHaveValue(/^> .*validator/);
    await expect(user.thread.composer).toBeFocused();
    await expect(user.status.toast).toHaveText("Quoted into this item's conversation");
  });

  test('is offered for a keyboard selection too', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    await user.page.locator('.preview .ac li .txt').first().evaluate(selectAllOf);

    await user.page.keyboard.press('Shift+ArrowRight');

    await expect(user.button('Ask about this')).toBeVisible();
  });
});

test('Markdown from Claude can never run code: raw HTML shows as text', async ({ claude, user }) => {
  const run = await claude.opensRun();
  await user.opens(run);
  await user.drawers.openRun();

  await run.say(run.threadId, HOSTILE_MARKDOWN);

  await expect(user.thread.claudeMessages.first()).toContainText('<img src=x onerror');
  expect(await user.page.evaluate(() => window.__ran)).toBeUndefined();
  // The guard in support/fixtures.ts also fails the test on any CSP violation.
});

/** Runs in the page: selects all of an element's text. */
function selectAllOf(element: Element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  getSelection()!.removeAllRanges();
  getSelection()!.addRange(range);
}
