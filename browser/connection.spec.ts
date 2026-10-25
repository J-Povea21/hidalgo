/**
 * What the page says about its connection and whose turn it is, through waits,
 * goodbyes, crashes, restarts, resumes and an outdated page.
 */
import { createServer, request, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connectionOf, expect, FAVICON, faviconColor, openRun, root, test, turnOf } from './harness.ts';

/** Asks a server's hello directly, the way a page does, to learn its build. */
function buildOf(url: string): Promise<string> {
  const address = new URL(url);
  const run = new URLSearchParams(address.hash.slice(1)).get('run')!;
  return new Promise((resolve, reject) => {
    request(
      {
        host: '127.0.0.1',
        port: address.port,
        path: `/api/hello?run=${run}&nonce=${'0'.repeat(32)}`,
        headers: { host: address.host },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve((JSON.parse(body) as { build: string }).build));
      },
    )
      .on('error', reject)
      .end();
  });
}

test('B-2 the turn, title and favicon follow the wait at once, and survive a reload', async ({ page, wb }) => {
  const { runId, added, url } = await openRun(wb, [{}], 'turns');
  await page.goto(url);
  await expect(page).toHaveTitle('… MiPlan · card · turns');
  expect(await turnOf(page)).toBe('working');
  await expect.poll(() => faviconColor(page)).toBe(FAVICON.working);

  const waiting = wb.start('wait_for_events', { runId });
  // Well under the 15 s keep-alive: a lagging push would only show up on the next ping.
  await expect(page).toHaveTitle('(1) MiPlan · card · turns', { timeout: 3_000 });
  await expect(page.locator('[data-turn]')).toHaveText('Your turn');
  await expect.poll(() => faviconColor(page)).toBe(FAVICON.yours);

  await page.reload();
  await expect(page.locator('[data-turn="yours"]')).toBeVisible({ timeout: 3_000 });

  await page.getByLabel('About this item only.').fill('over to you');
  await page.getByLabel('About this item only.').press('ControlOrMeta+Enter');
  expect((await waiting).events[0]).toMatchObject({ type: 'message', item: added[0]!.id, text: 'over to you' });
  await expect(page).toHaveTitle('… MiPlan · card · turns', { timeout: 3_000 });
  await expect(page.getByText('Claude is thinking…')).toBeVisible();
});

test('B-2b after a goodbye and a restart the same tab is usable again', async ({ page, wb }) => {
  const { runId, added, url } = await openRun(wb);
  await page.goto(url);
  await expect(page.locator('[data-turn]')).toBeVisible();

  await wb.stop();
  await expect(page.getByRole('status').filter({ hasText: 'The Claude session ended' })).toBeVisible();
  await expect(page).toHaveTitle(/^○ /);
  expect(await connectionOf(page)).toBe('ended');
  await expect(page.getByText('Claude is thinking…')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();

  await wb.restart();
  await expect.poll(() => connectionOf(page), { timeout: 10_000 }).toBe('live');
  await expect(page.getByRole('status').filter({ hasText: 'The Claude session ended' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();

  expect(
    await wb.call('open_session', { skill: 'card', project: 'MiPlan', subject: 's', resume: runId }),
  ).toMatchObject({ resumed: true, opened: false, alreadyOpen: 1 });
  const waiting = wb.start('wait_for_events', { runId });
  await page.getByRole('button', { name: 'Reject' }).click();
  expect((await waiting).events[0]).toMatchObject({ verdict: 'rejected', item: added[0]!.id });
});

test('B-3 a crash: reconnecting, then lost, then live again on the same port', async ({ page, wb }) => {
  const { runId, added, url } = await openRun(wb);
  await page.clock.install();
  await page.goto(url);
  await expect(page.locator('[data-turn]')).toBeVisible();
  const port = new URL(url).port;

  await wb.crash();
  await expect(page.getByRole('status').filter({ hasText: 'Reconnecting' })).toBeVisible();
  await expect(page).toHaveTitle(/^○ /);
  await expect(page.getByLabel('About this item only.')).toBeDisabled();

  // Each retry waits on a real fetch between fake timers: keep moving the clock until it gives up.
  await expect
    .poll(
      async () => {
        await page.clock.fastForward(16_000);
        return connectionOf(page);
      },
      { timeout: 15_000 },
    )
    .toBe('lost');
  await expect(page.getByRole('alert').filter({ hasText: "Can't reach Claude's session" })).toBeVisible();

  await wb.restart();
  expect(
    new URL(wb.url(runId)).port,
    'the new server reclaims the old port (a parallel worker may have taken it)',
  ).toBe(port);
  await expect
    .poll(
      async () => {
        await page.clock.fastForward(16_000);
        return connectionOf(page);
      },
      { timeout: 15_000 },
    )
    .toBe('live');
  await expect(page.getByRole('alert')).toHaveCount(0);

  // State flows again without a reload.
  await wb.call('update_item', { runId, itemId: added[0]!.id, patch: { tags: ['after-crash'] } });
  await expect(page.locator('.chip').filter({ hasText: 'after-crash' })).toBeVisible();
  wb.start('wait_for_events', { runId });
  await expect(page.locator('[data-turn="yours"]')).toBeVisible();
});

test('B-4 pausing, and resuming with the tab open reuses it; with it closed opens a new one', async ({
  page,
  wb,
  context,
}) => {
  const { runId, url } = await openRun(wb);
  await page.goto(url);
  await expect(page.locator('[data-turn]')).toBeVisible();

  await wb.call('close_session', { runId, status: 'paused', outcome: 'later' });
  await expect(page.getByRole('status').filter({ hasText: 'This run is paused' })).toBeVisible();
  await expect(page).toHaveTitle(/^⏸ /);
  await expect(page.locator('[data-turn]')).toHaveText('Paused · resumable');

  const before = wb.pages.length;
  expect(
    await wb.call('open_session', { skill: 'card', project: 'MiPlan', subject: 's', resume: runId }),
  ).toMatchObject({ resumed: true, opened: false, alreadyOpen: 1 });
  await expect(page.getByTestId('toast')).toHaveText('Claude resumed this run.');
  await expect(page.getByRole('status').filter({ hasText: 'This run is paused' })).toHaveCount(0);
  await expect(page.getByLabel('About this item only.')).toBeEnabled();
  await page.waitForTimeout(1_000);
  expect(wb.pages.length, 'no new tab was asked for').toBe(before);

  // A closed tab drops out at once, not on the next keep-alive.
  await wb.call('close_session', { runId, status: 'paused', outcome: 'later' });
  await page.close();
  const next = wb.nextPage();
  expect(
    await wb.call('open_session', { skill: 'card', project: 'MiPlan', subject: 's', resume: runId }),
  ).toMatchObject({ resumed: true, opened: true });
  const reopened = await context.newPage();
  await reopened.goto(await next);
  await expect(reopened.locator('[data-turn]')).toBeVisible();
});

test('B-5 a page from an older build says to reload, and never sends the token', async ({ page, wb, net }) => {
  const { url } = await openRun(wb);
  const build = await buildOf(url);
  const bundle = readFileSync(join(root, 'dist', 'client', 'app.js'), 'utf8');
  expect(bundle.split(`"${build}"`).length - 1, 'the build id appears once in app.js').toBe(1);
  await page.route('**/app.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: bundle.replace(`"${build}"`, '"000000000000"') }),
  );

  await page.goto(url);
  await expect(page.getByRole('alert').filter({ hasText: 'older version of workbench' })).toBeVisible();
  expect(await connectionOf(page)).toBe('stale');
  await expect(page.getByText("Connecting to Claude's session…")).toHaveCount(0);
  expect(net.tokenRequests).toEqual([]);

  await page.unroute('**/app.js');
  await page.getByRole('button', { name: 'Reload the page' }).click();
  await expect.poll(() => connectionOf(page)).toBe('live');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('B-6a connecting: the page says so until the server proves itself', async ({ page, wb }) => {
  const { url } = await openRun(wb);
  await page.route('**/api/hello**', () => {
    /* never answered */
  });
  await page.goto(url);
  await expect(page.getByText("Connecting to Claude's session…")).toBeVisible();
  await expect(page).toHaveTitle('Workbench');
  expect(await connectionOf(page)).toBe('connecting');
});

test.describe('B-6b moved', () => {
  let stub: Server;
  test.afterEach(() => new Promise<void>((resolve) => stub.close(() => resolve())));

  test('a server that is not the run’s gets no token, and the page says the run moved', async ({ page, wb, net }) => {
    const { url } = await openRun(wb);
    // Something else on a port: it serves the page's files but knows nothing about the run.
    stub = createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0]!;
      if (path.startsWith('/api/')) {
        res.writeHead(404).end();
        return;
      }
      const file = path === '/' ? 'index.html' : path.slice(1);
      try {
        res.writeHead(200, {
          'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html',
        });
        res.end(req.method === 'HEAD' ? undefined : readFileSync(join(root, 'dist', 'client', file)));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', () => resolve()));
    const moved = new URL(url);
    moved.port = String((stub.address() as { port: number }).port);

    await page.goto(moved.toString());
    await expect(page.getByRole('alert').filter({ hasText: 'This run moved' })).toBeVisible();
    await expect(page.getByText("Connecting to Claude's session…")).toHaveCount(0);
    expect(net.tokenRequests).toEqual([]);
  });
});

test('B-6c idle: with nobody waiting, the page says Claude went quiet; a wait clears it', async ({ page, wb }) => {
  const { runId, url } = await openRun(wb);
  await page.clock.install();
  await page.goto(url);
  await expect(page.locator('[data-turn="working"]')).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('status').filter({ hasText: "Claude isn't listening right now" })).toBeVisible();
  expect(await turnOf(page)).toBe('idle');
  wb.start('wait_for_events', { runId });
  await expect(page.getByRole('status').filter({ hasText: "Claude isn't listening right now" })).toHaveCount(0);
  expect(await turnOf(page)).toBe('yours');
});
