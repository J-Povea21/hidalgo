/**
 * What the page says about its connection and whose turn it is: through waits,
 * goodbyes, crashes, restarts, resumes, an outdated page and a stranger on the port.
 */
import { readFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import { extname, join } from 'node:path';
import {
  expect,
  FAVICON,
  type OpenRun,
  packageRoot,
  PAST_A_RETRY_MS,
  PAST_ACTIVE_WINDOW_MS,
  PROMPTLY,
  test,
  type UserInPage,
  WITHIN_A_RECONNECT,
} from './support/index.ts';

test.describe('whose turn it is', () => {
  test('the title, turn line and favicon follow a wait at once, and survive a reload', async ({ claude, user }) => {
    const run = await claude.opensRun({ subject: 'turns' });
    await user.opens(run);

    await expect(user.page).toHaveTitle('… MiPlan · card · turns');
    await expect(user.status.turnLine).toHaveAttribute('data-turn', 'working');
    await expect.poll(() => user.status.favicon()).toBe(FAVICON.working);

    const message = run.waitForTheUser();

    await expect(user.page).toHaveTitle('(1) MiPlan · card · turns', PROMPTLY);
    await expect(user.status.turnLine).toHaveText('Your turn');
    await expect.poll(() => user.status.favicon()).toBe(FAVICON.yours);

    await user.page.reload();

    await expect(user.status.turnLine).toHaveAttribute('data-turn', 'yours', PROMPTLY);
    await expect.poll(() => user.status.favicon()).toBe(FAVICON.yours);

    await user.thread.write('over to you');

    expect(await message).toEqual([expect.objectContaining({ type: 'message', text: 'over to you' })]);
    await expect(user.page).toHaveTitle('… MiPlan · card · turns', PROMPTLY);
    await expect.poll(() => user.status.favicon()).toBe(FAVICON.working);
  });

  test('with nobody waiting, the page says Claude went quiet; a wait clears it', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.page.clock.install();
    await user.opens(run);
    await expect(user.status.turnLine).toHaveAttribute('data-turn', 'working');

    await user.page.clock.fastForward(PAST_ACTIVE_WINDOW_MS);

    await expect(user.status.banner("Claude isn't listening right now")).toBeVisible();
    expect(await user.status.turn()).toBe('idle');

    run.waitForTheUser();

    await expect(user.status.banner("Claude isn't listening right now")).toHaveCount(0);
    expect(await user.status.turn()).toBe('yours');
  });
});

test.describe('when the session goes away', () => {
  test('after a goodbye and a restart, the same tab is usable again', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.opens(run);
    await expect(user.status.turnLine).toBeVisible();

    await claude.ends();

    await expect(user.status.banner('The Claude session ended')).toBeVisible();
    await expect(user.page).toHaveTitle(/^○ /);
    expect(await user.status.connection()).toBe('ended');
    await expect(user.verdict.approveButton).toBeDisabled();

    await claude.restarts();

    await expect.poll(() => user.status.connection(), WITHIN_A_RECONNECT).toBe('live');
    await expect(user.status.banner('The Claude session ended')).toHaveCount(0);
    await expect(user.verdict.approveButton).toBeEnabled();
    expect(await run.resume()).toMatchObject({ resumed: true, opened: false, alreadyOpen: 1 });

    const rejection = run.waitForTheUser();
    await user.verdict.reject();

    expect(await rejection).toEqual([expect.objectContaining({ verdict: 'rejected', item: run.items[0]!.id })]);
  });

  test('after a crash: reconnecting, then lost, then live again on the same port', async ({ claude, user }) => {
    const run = await claude.opensRun();
    await user.page.clock.install();
    await user.opens(run);
    await expect(user.status.turnLine).toBeVisible();
    const port = new URL(run.url).port;

    await claude.crashes();

    await expect(user.status.banner('Reconnecting')).toBeVisible();
    await expect(user.page).toHaveTitle(/^○ /);
    await expect(user.thread.composer).toBeDisabled();

    await expect.poll(afterTheNextRetry(user), WITHIN_A_RECONNECT).toBe('lost');
    await expect(user.status.alert("Can't reach Claude's session")).toBeVisible();

    await claude.restarts();

    expect(new URL(claude.pageOf(run.runId)).port, 'the new server takes the old port back').toBe(port);
    await expect.poll(afterTheNextRetry(user), WITHIN_A_RECONNECT).toBe('live');
    await expect(user.page.getByRole('alert')).toHaveCount(0);

    await run.revise(run.items[0]!.id, { tags: ['after-crash'] });

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
    await expect(user.status.turnLine).toBeVisible();

    await run.pause();

    await expect(user.status.banner('This run is paused')).toBeVisible();
    await expect(user.page).toHaveTitle(/^⏸ /);
    await expect(user.status.turnLine).toHaveText('Paused · resumable');

    const pagesBefore = claude.openedPages.length;
    const resumed = await run.resume();

    expect(resumed).toMatchObject({ resumed: true, opened: false, alreadyOpen: 1 });
    await expect(user.status.toast).toHaveText('Claude resumed this run.');
    await expect(user.status.banner('This run is paused')).toHaveCount(0);
    await expect(user.thread.composer).toBeEnabled();
    expect(claude.openedPages, 'no second tab was asked for').toHaveLength(pagesBefore);

    // A closed tab drops out at once, not on the next keep-alive.
    await run.pause();
    await user.page.close();
    const reopened = claude.nextOpenedPage();

    expect(await run.resume()).toMatchObject({ resumed: true, opened: true });
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
    const olderBundle = bundle.replace(`"${build}"`, '"000000000000"');
    await user.page.route('**/app.js', (route) => route.fulfill({ contentType: 'text/javascript', body: olderBundle }));

    await user.opens(run);

    await expect(user.status.alert('older version of workbench')).toBeVisible();
    expect(await user.status.connection()).toBe('stale');
    await expect(user.page.getByText("Connecting to Claude's session…")).toHaveCount(0);
    expect(net.tokenRequests).toEqual([]);

    await user.page.unroute('**/app.js');
    await user.button('Reload the page').click();

    await expect.poll(() => user.status.connection()).toBe('live');
  });

  test.describe('a stranger on the port', () => {
    let stranger: Server;
    test.afterEach(() => new Promise<void>((resolve) => stranger.close(() => resolve())));

    test('gets no token, and the page says the run moved', async ({ claude, user, net }) => {
      const run = await claude.opensRun();
      stranger = await servingThePageButNotTheRun();
      const elsewhere = new URL(run.url);
      elsewhere.port = String(portOf(stranger));

      await user.opens(elsewhere.toString());

      await expect(user.status.alert('This run moved')).toBeVisible();
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
    expect(await user.status.connection()).toBe('connecting');
  });
});

/**
 * Moves the fake clock past the page's next reconnect attempt and reports the connection.
 * Each attempt awaits a real request between fake timers, so it is polled, not stepped once.
 */
function afterTheNextRetry(user: UserInPage) {
  return async () => {
    await user.page.clock.fastForward(PAST_A_RETRY_MS);
    return user.status.connection();
  };
}

/** Asks the server's hello directly, as a page does, to learn its build id. */
function buildOf(run: OpenRun): Promise<string> {
  const address = new URL(run.url);
  const nonce = '0'.repeat(32);
  const path = `/api/hello?run=${run.runId}&nonce=${nonce}`;
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port: address.port, path, headers: { host: address.host } }, (response) => {
      let body = '';
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => {
        const hello: { build: string } = JSON.parse(body);
        resolve(hello.build);
      });
    })
      .on('error', reject)
      .end();
  });
}

const CONTENT_TYPE: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };

/** Something else on a port: it serves the page's files but knows nothing about the run. */
async function servingThePageButNotTheRun(): Promise<Server> {
  const server = createServer((incoming, response) => {
    const path = (incoming.url ?? '/').split('?')[0]!;
    if (path.startsWith('/api/')) {
      response.writeHead(404).end();
      return;
    }
    const file = path === '/' ? 'index.html' : path.slice(1);
    try {
      const body = readFileSync(join(packageRoot, 'dist', 'client', file));
      const type = CONTENT_TYPE[extname(file)] ?? 'application/octet-stream';
      response.writeHead(200, { 'content-type': type }).end(incoming.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  return server;
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the stranger is not listening on a TCP port');
  }
  return address.port;
}
