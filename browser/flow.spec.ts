/** The user's main path through a run: answer, approve, edit, chat, move between items. */
import { card, connectionOf, expect, FAVICON, faviconColor, openRun, question, test, turnOf } from './harness.ts';

test('B-1 answer the questions, approve, and the run closes', async ({ page, wb }) => {
  const { runId, added, url } = await openRun(wb, [
    { questions: [question, { ...question, text: 'Second question?' }] },
    {},
  ]);
  const chunks: string[] = [];
  page.on('request', (request) => {
    if (/mermaid/i.test(request.url())) chunks.push(request.url());
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Card 1' })).toBeVisible();
  expect(chunks, 'Mermaid loads only for a diagram').toEqual([]);

  const waiting = wb.start('wait_for_events', { runId });
  await page.getByLabel(/^Here/).check();
  await expect(page.getByRole('heading', { name: 'Question 2 of 2' })).toBeVisible();
  await page.getByLabel(/^Neither/).check();
  await page.getByLabel('Note for Claude (optional)').fill('leave them for now');
  await page.getByRole('button', { name: 'Send 2 answers' }).click();

  const { events } = await waiting;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'answers',
    item: added[0]!.id,
    answers: [
      { question: question.text, chose: 'Here' },
      { question: 'Second question?', chose: 'Neither', note: 'leave them for now' },
    ],
  });
  await expect(page.getByText('Nothing left to decide on this item')).toBeVisible();
  await expect(page.locator('.ruling').filter({ hasText: 'Here' })).toBeVisible();

  const verdict = wb.start('wait_for_events', { runId });
  await page.getByRole('button', { name: 'Approve' }).click();
  expect((await verdict).events[0]).toMatchObject({ type: 'verdict', item: added[0]!.id, verdict: 'approved', rev: 1 });
  await expect(page.getByText('Approved · rev 1')).toBeVisible();

  await wb.call('mark_done', { runId, itemId: added[0]!.id, note: 'created 86e3' });
  await page.getByRole('button', { name: 'Next →' }).click();
  const reject = wb.start('wait_for_events', { runId });
  await page.getByRole('button', { name: 'Reject' }).click();
  expect((await reject).events[0]).toMatchObject({ verdict: 'rejected', item: added[1]!.id });
  await wb.call('close_session', { runId, status: 'closed', outcome: 'created 1, rejected 1' });

  await expect(page).toHaveTitle(/^✓ /);
  expect(await turnOf(page)).toBe('done');
  await expect(page.locator('[data-turn]')).toHaveText('Run ended');
  await expect.poll(() => faviconColor(page)).toBe(FAVICON.done);
  await expect(page.getByLabel('About this item only.')).toBeDisabled();
});

test('B-7 reject, leave pending then approve, and a revision brings the buttons back', async ({ page, wb }) => {
  const { runId, added, url } = await openRun(wb, [{}, {}, {}]);
  await page.goto(url);

  let waiting = wb.start('wait_for_events', { runId });
  await page.getByRole('button', { name: 'Reject' }).click();
  expect((await waiting).events[0]).toMatchObject({ verdict: 'rejected' });
  await expect(page.locator('.verdict .badge.rejected')).toBeVisible();

  await page.getByRole('button', { name: 'Next →' }).click();
  waiting = wb.start('wait_for_events', { runId });
  await page.getByRole('button', { name: 'Leave pending' }).click();
  expect((await waiting).events[0]).toMatchObject({ verdict: 'pending', item: added[1]!.id });
  await expect(page.locator('.verdict .badge.pending')).toBeVisible();
  waiting = wb.start('wait_for_events', { runId });
  await page.getByRole('button', { name: 'Approve' }).click();
  expect((await waiting).events[0]).toMatchObject({ verdict: 'approved', item: added[1]!.id });

  await wb.call('update_item', { runId, itemId: added[1]!.id, patch: { tags: ['revised'] } });
  await expect(page.getByText('Approves exactly rev 2.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
});

test('B-8 chat: Ctrl/⌘+Enter sends, Enter is a newline, replies land, the run drawer shows unread', async ({
  page,
  wb,
}) => {
  const { runId, threadId, added, url } = await openRun(wb);
  await page.goto(url);
  const box = page.getByLabel('About this item only.');
  await box.fill('first line');
  await box.press('Enter');
  await box.pressSequentially('second line');
  const waiting = wb.start('wait_for_events', { runId });
  await box.press('ControlOrMeta+Enter');
  const [ev] = (await waiting).events;
  expect(ev).toMatchObject({
    type: 'message',
    item: added[0]!.id,
    thread: added[0]!.threadId,
    text: 'first line\nsecond line',
  });
  await expect(box).toHaveValue('');
  await expect(box).toBeFocused();

  await wb.call('send_message', { runId, replyTo: ev.seq, text: 'Got it.' });
  await expect(page.locator('.msg.claude').filter({ hasText: 'Got it.' })).toBeVisible();

  // Claude starts a conversation in the run thread; the drawer button shows it as unread.
  await wb.call('send_message', { runId, threadId, text: 'A note on the whole run.' });
  const runButton = page.getByRole('button', { name: /^Run/ });
  await expect(runButton.getByRole('img', { name: 'new messages' })).toBeVisible();
  await runButton.click();
  await expect(runButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('A note on the whole run.')).toBeVisible();
  await expect(runButton.getByRole('img', { name: 'new messages' })).toHaveCount(0);
});

test('B-9 editing a criterion sends the edit, and the new revision says it was edited', async ({ page, wb }) => {
  const { runId, added, url } = await openRun(wb);
  await page.goto(url);
  await page.getByRole('button', { name: 'Edit' }).first().click();
  const editor = page.getByLabel('Edit criterion');
  await expect(editor).toBeFocused();
  await editor.fill('The validator rejects a non-array with a 400');
  const waiting = wb.start('wait_for_events', { runId });
  await page.getByRole('button', { name: 'Save edit' }).click();
  expect((await waiting).events[0]).toMatchObject({
    type: 'edit',
    item: added[0]!.id,
    path: 'criteria.0.text',
    text: 'The validator rejects a non-array with a 400',
  });
  await expect(page.getByText('edited by you · will be re-probed')).toBeVisible();
  await expect(page.getByText('Approves exactly rev 2.')).toBeVisible();
});

test('B-11 item navigation, and position and drafts survive a reload', async ({ page, wb }) => {
  const { url } = await openRun(wb, [{}, {}, {}]);
  await page.goto(url);
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByRole('heading', { name: 'Card 3' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Items in this run' }).getByRole('button', { name: 'Card 2: ready' }),
  ).toBeVisible();
  await page.getByLabel('About this item only.').fill('a draft I have not sent');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Card 3' })).toBeVisible();
  await expect(page.getByLabel('About this item only.')).toHaveValue('a draft I have not sent');
  await page
    .getByRole('navigation', { name: 'Items in this run' })
    .getByRole('button', { name: 'Card 1: ready' })
    .click();
  await expect(page.getByRole('heading', { name: 'Card 1' })).toBeVisible();
});

test('B-15 hostile Markdown from Claude runs nothing', async ({ page, wb }) => {
  const { runId, threadId, url } = await openRun(wb);
  await page.goto(url);
  await page.getByRole('button', { name: /^Run/ }).click();
  await wb.call('send_message', {
    runId,
    threadId,
    text: 'img <img src=x onerror="window.__x=1"> and [a link](javascript:window.__x=2) and <svg><script>window.__x=3</script></svg> and <math><mtext><table><mglyph><style><img src=x onerror="window.__x=4">',
  });
  await expect(page.locator('.msg.claude').first()).toBeVisible();
  await page
    .locator('.msg.claude a')
    .first()
    .click({ trial: true })
    .catch(() => undefined);
  expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
  expect(await connectionOf(page)).toBe('live');
});

test('B-16 two runs with the same subject show their start time in the title', async () => {
  test.fixme(true, 'Not built: see "Amendments after approval" in docs/workbench/design.md.');
});

test.describe('cards with questions open', () => {
  test('Approve stays blocked until every question is answered, and says why', async ({ page, wb }) => {
    const { url } = await openRun(wb, [{ questions: [question] }]);
    await page.goto(url);
    const approve = page.getByRole('button', { name: 'Approve' });
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAccessibleDescription('Answer the 1 open question first');
  });
});

test('the card shows its fields as written', async ({ page, wb }) => {
  const { url } = await openRun(wb, [{ fields: card('A card with every field') }]);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'A card with every field' })).toBeVisible();
  await expect(page.locator('.chip')).toHaveText(['backend', 'bug']);
  await expect(page.getByText('The validator guards its own input')).toBeVisible();
  await expect(page.locator('code').filter({ hasText: 'officeIds' })).toBeVisible();
});
