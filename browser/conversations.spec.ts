/** Talking with Claude: the item's thread, the whole-run thread, quoting the card, and what Markdown may do. */
import { expect, test } from './support/test.ts';

test('a message sent with Ctrl/⌘+Enter reaches Claude, Enter alone is a new line, and the reply shows', async ({
  claude,
  user,
}) => {
  const run = await claude.opensRun();
  await user.opens(run);
  await user.itemComposer.fill('first line');
  await user.itemComposer.press('Enter');
  await user.itemComposer.pressSequentially('second line');

  const message = claude.waitsForTheUser(run);
  await user.itemComposer.press('ControlOrMeta+Enter');
  const [sent] = await message;
  expect(sent).toMatchObject({ type: 'message', item: run.items[0]!.id, text: 'first line\nsecond line' });
  await expect(user.itemComposer).toHaveValue('');
  await expect(user.itemComposer).toBeFocused();

  await claude.replies(run, sent!, 'Got it.');
  await expect(user.claudeMessages.filter({ hasText: 'Got it.' })).toBeVisible();
});

test('Claude can start a conversation in the run thread; it shows as unread until opened', async ({ claude, user }) => {
  const run = await claude.opensRun();
  await user.opens(run);
  await claude.says(run, run.threadId, 'A note on the whole run.');

  await expect(user.unreadMark).toBeVisible();
  await user.opensRunDrawer();
  await expect(user.button(/^Run/)).toHaveAttribute('aria-expanded', 'true');
  await expect(user.page.getByText('A note on the whole run.')).toBeVisible();
  await expect(user.unreadMark).toHaveCount(0);
});

test('while Claude works on a message, its thread says so; once Claude listens again, it stops', async ({
  claude,
  user,
}) => {
  const run = await claude.opensRun();
  await user.opens(run);
  const message = claude.waitsForTheUser(run);
  await user.writes('over to you');
  await message;
  await expect(user.page.getByText('Claude is thinking…')).toBeVisible();

  claude.waitsForTheUser(run);
  await expect(user.page.getByText('Claude is thinking…')).toHaveCount(0);
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
    await expect(user.itemComposer).toHaveValue(/^> .*validator/);
    await expect(user.itemComposer).toBeFocused();
    await expect(user.toast).toHaveText("Quoted into this item's conversation");
  });

  test('is offered for a keyboard selection too', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    await user.page
      .locator('.preview .ac li .txt')
      .first()
      .evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
      });
    await user.page.keyboard.press('Shift+ArrowRight');
    await expect(user.button('Ask about this')).toBeVisible();
  });
});

test('Markdown from Claude can never run code: raw HTML shows as text', async ({ claude, user }) => {
  const run = await claude.opensRun();
  await user.opens(run);
  await user.opensRunDrawer();
  await claude.says(
    run,
    run.threadId,
    [
      'img <img src=x onerror="window.__ran=1">',
      '[a link](javascript:window.__ran=2)',
      '<svg><script>window.__ran=3</script></svg>',
      '<math><mtext><table><mglyph><style><img src=x onerror="window.__ran=4">',
    ].join(' and '),
  );
  await expect(user.claudeMessages.first()).toContainText('<img src=x onerror');
  expect(await user.page.evaluate(() => (window as unknown as { __ran?: number }).__ran)).toBeUndefined();
  // The guard in support/test.ts also fails the test on any CSP violation.
});
