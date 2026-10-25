/**
 * What the page says about its connection and whose turn it is: through waits,
 * goodbyes, crashes, restarts, resumes, an outdated page and a stranger on the port.
 */
import { createServer, request, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot, type Run } from './support/claude.ts';
import { expect, test } from './support/test.ts';
import { FAVICON } from './support/user.ts';

/** Under the server's 15 s keep-alive: a push that lagged would only arrive with the next one. */
const PROMPTLY = { timeout: 3_000 };
/** Longer than the page's widest gap between reconnect attempts. */
const RECONNECT_WINDOW = { timeout: 15_000 };
/** One step of the fake clock: past the page's longest retry gap (15 s). */
const PAST_A_RETRY_MS = 16_000;
/** Past the 60 s after Claude's last tool call during which the page still says it is working. */
const PAST_ACTIVE_WINDOW_MS = 61_000;

/** Asks the server's hello directly, as a page does, to learn its build id. */
function buildOf(run: Run): Promise<string> {
  const address = new URL(run.url);
  const nonce = '0'.repeat(32);
  return new Promise((resolve, reject) => {
    request(
      {
        host: '127.0.0.1',
        port: address.port,
        path: `/api/hello?run=${run.runId}&nonce=${nonce}`,
        headers: { host: address.host },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => resolve((JSON.parse(body) as { build: string }).build));
      },
    )
      .on('error', reject)
      .end();
  });
}

test.describe('whose turn it is', () => {
  test('the title, turn line and favicon follow a wait at once, and survive a reload', async ({ claude, user }) => {
    const run = await claude.opensRun({ subject: 'turns' });
    await user.opens(run);
    await expect(user.page).toHaveTitle('… MiPlan · card · turns');
    await expect(user.turnLine).toHaveAttribute('data-turn', 'working');
    await expect.poll(() => user.favicon()).toBe(FAVICON.working);

    const message = claude.waitsForTheUser(run);
    await expect(user.page).toHaveTitle('(1) MiPlan · card · turns', PROMPTLY);
    await expect(user.turnLine).toHaveText('Your turn');
    await expect.poll(() => user.favicon()).toBe(FAVICON.yours);

    await user.page.reload();
    await expect(user.turnLine).toHaveAttribute('data-turn', 'yours', PROMPTLY);

    await user.writes('over to you');
    expect(await message).toEqual([expect.objectContaining({ type: 'message', text: 'over to you' })]);
    await expect(user.page).toHaveTitle('… MiPlan · card · turns', PROMPTLY);
  });

  test('with nobody waiting, the page says Claude went quiet; a wait clears it', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.page.clock.install();
    await user.opens(run);
    await expect(user.turnLine).toHaveAttribute('data-turn', 'working');

    await user.page.clock.fastForward(PAST_ACTIVE_WINDOW_MS);
    await expect(user.banner("Claude isn't listening right now")).toBeVisible();
    expect(await user.turn()).toBe('idle');

    claude.waitsForTheUser(run);
    await expect(user.banner("Claude isn't listening right now")).toHaveCount(0);
    expect(await user.turn()).toBe('yours');
  });
});

test.describe('when the session goes away', () => {
  test('after a goodbye and a restart, the same tab is usable again', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    await expect(user.turnLine).toBeVisible();

    await claude.ends();
    await expect(user.banner('The Claude session ended')).toBeVisible();
    await expect(user.page).toHaveTitle(/^○ /);
    expect(await user.connection()).toBe('ended');
    await expect(user.button('Approve')).toBeDisabled();

    await claude.restarts();
    await expect.poll(() => user.connection(), RECONNECT_WINDOW).toBe('live');
    await expect(user.banner('The Claude session ended')).toHaveCount(0);
    await expect(user.button('Approve')).toBeEnabled();

    expect(await claude.resumes(run)).toMatchObject({ resumed: true, opened: false, alreadyOpen: 1 });
    const verdict = claude.waitsForTheUser(run);
    await user.rejects();
    expect(await verdict).toEqual([expect.objectContaining({ verdict: 'rejected', item: run.items[0]!.id })]);
  });

  test('after a crash: reconnecting, then lost, then live again on the same port', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.page.clock.install();
    await user.opens(run);
    await expect(user.turnLine).toBeVisible();
    const port = new URL(run.url).port;

    await claude.crashes();
    await expect(user.banner('Reconnecting')).toBeVisible();
    await expect(user.page).toHaveTitle(/^○ /);
    await expect(user.itemComposer).toBeDisabled();

    // Each retry awaits a real request between fake timers, so the clock is moved until the page gives up.
    const afterARetry = async () => {
      await user.page.clock.fastForward(PAST_A_RETRY_MS);
      return user.connection();
    };
    await expect.poll(afterARetry, RECONNECT_WINDOW).toBe('lost');
    await expect(user.page.getByRole('alert').filter({ hasText: "Can't reach Claude's session" })).toBeVisible();

    await claude.restarts();
    expect(new URL(claude.pageOf(run.runId)).port, 'the new server takes the old port back').toBe(port);
    await expect.poll(afterARetry, RECONNECT_WINDOW).toBe('live');
    await expect(user.page.getByRole('alert')).toHaveCount(0);

    await claude.revises(run, run.items[0]!.id, { tags: ['after-crash'] });
    await expect(user.page.locator('.chip').filter({ hasText: 'after-crash' })).toBeVisible();
  });
});

test.describe('pausing and resuming', () => {
  test('resuming with the tab open reuses it; with the tab closed, opens a new one', async ({
    claude,
    user,
    context,
  }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    await expect(user.turnLine).toBeVisible();

    await claude.pauses(run);
    await expect(user.banner('This run is paused')).toBeVisible();
    await expect(user.page).toHaveTitle(/^⏸ /);
    await expect(user.turnLine).toHaveText('Paused · resumable');

    const pagesBefore = claude.openedPages.length;
    expect(await claude.resumes(run)).toMatchObject({ resumed: true, opened: false, alreadyOpen: 1 });
    await expect(user.toast).toHaveText('Claude resumed this run.');
    await expect(user.banner('This run is paused')).toHaveCount(0);
    await expect(user.itemComposer).toBeEnabled();
    expect(claude.openedPages, 'no second tab was asked for').toHaveLength(pagesBefore);

    // A closed tab drops out at once, not on the next keep-alive.
    await claude.pauses(run);
    await user.page.close();
    const reopened = claude.nextOpenedPage();
    expect(await claude.resumes(run)).toMatchObject({ resumed: true, opened: true });
    const newTab = await context.newPage();
    await newTab.goto(await reopened);
    await expect(newTab.locator('[data-turn]')).toBeVisible();
  });
});

test.describe('pages that must not talk to the server', () => {
  test('a page from an older build says to reload, and never sends the token', async ({ claude, user, net }) => {
    const run = await claude.opensRun();
    const build = await buildOf(run);
    const bundle = readFileSync(join(packageRoot, 'dist', 'client', 'app.js'), 'utf8');
    expect(bundle.split(`"${build}"`).length - 1, 'the build id appears once in app.js').toBe(1);
    const olderBuild = bundle.replace(`"${build}"`, '"000000000000"');
    await user.page.route('**/app.js', (route) => route.fulfill({ contentType: 'text/javascript', body: olderBuild }));

    await user.opens(run);
    await expect(user.page.getByRole('alert').filter({ hasText: 'older version of workbench' })).toBeVisible();
    expect(await user.connection()).toBe('stale');
    await expect(user.page.getByText("Connecting to Claude's session…")).toHaveCount(0);
    expect(net.tokenRequests).toEqual([]);

    await user.page.unroute('**/app.js');
    await user.button('Reload the page').click();
    await expect.poll(() => user.connection()).toBe('live');
  });

  test.describe('a stranger on the port', () => {
    let stranger: Server;
    test.afterEach(() => new Promise<void>((resolve) => stranger.close(() => resolve())));

    test('gets no token, and the page says the run moved', async ({ claude, user, net }) => {
      const run = await claude.opensRun();
      // Something else on a port: it serves the page's files but knows nothing about the run.
      stranger = createServer((incoming, response) => {
        const path = (incoming.url ?? '/').split('?')[0]!;
        if (path.startsWith('/api/')) {
          return void response.writeHead(404).end();
        }
        const file = path === '/' ? 'index.html' : path.slice(1);
        const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
        try {
          const body = readFileSync(join(packageRoot, 'dist', 'client', file));
          response.writeHead(200, { 'content-type': type }).end(incoming.method === 'HEAD' ? undefined : body);
        } catch {
          response.writeHead(404).end();
        }
      });
      await new Promise<void>((resolve) => stranger.listen(0, '127.0.0.1', () => resolve()));
      const elsewhere = new URL(run.url);
      elsewhere.port = String((stranger.address() as { port: number }).port);

      await user.opens(elsewhere.toString());
      await expect(user.page.getByRole('alert').filter({ hasText: 'This run moved' })).toBeVisible();
      await expect(user.page.getByText("Connecting to Claude's session…")).toHaveCount(0);
      expect(net.tokenRequests).toEqual([]);
    });
  });

  test('until the server proves itself, the page only says it is connecting', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.page.route('**/api/hello**', () => {
      // never answered
    });
    await user.opens(run);
    await expect(user.page.getByText("Connecting to Claude's session…")).toBeVisible();
    await expect(user.page).toHaveTitle('Workbench');
    expect(await user.connection()).toBe('connecting');
  });
});
