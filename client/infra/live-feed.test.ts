import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STREAM_EVENT } from '@shared/constants.ts';
import { aRun } from '@test/builders.ts';
import { until } from '@test/fixtures.ts';
import { pageOpenedOnItsPort, SESSION, SomethingOnThePort } from '@test/something-on-the-port.ts';
import type { ConnectionKind } from '@client/core/state.ts';
import { HttpWorkbenchServer } from './server.ts';

/** Retries a few milliseconds apart, so the story plays out quickly. */
const QUICK_RETRIES = { firstGapMs: 2, longestGapMs: 10 };

/** Every feed a test starts is stopped after it, even when the test fails half-way. */
const running: (() => void)[] = [];

beforeEach(pageOpenedOnItsPort);
afterEach(() => {
  running.splice(0).forEach((stop) => stop());
  vi.unstubAllGlobals();
});

/** Follows the session and records what the page would show: the connection states and the run versions. */
function followAndRecord(server: HttpWorkbenchServer) {
  const connections: ConnectionKind[] = [];
  const versions: number[] = [];
  running.push(
    server.follow({
      state: (run) => versions.push(run.version),
      presence: () => {},
      connection: (connection) => connections.push(connection.kind),
    }),
  );
  return { connections, versions };
}

describe('following the session', () => {
  it('after a goodbye and a server gone for a while, the page reconnects by itself when it comes back', async () => {
    const port = new SomethingOnThePort({ answering: 'the real server' })
      .willSayGoodbye('session ended')
      .willStream(STREAM_EVENT.state, { state: aRun({ version: 9 }), claudeListening: true, claudeActiveAt: 1 });
    const page = followAndRecord(new HttpWorkbenchServer(SESSION, QUICK_RETRIES));

    await until(() => page.connections.includes('ended'));
    port.goesDown();
    await until(() => page.connections.length > 3);

    expect(page.connections.slice(0, 2)).toEqual(['live', 'ended']);
    expect(page.versions).toEqual([]);

    port.comesBack();
    await until(() => page.versions.includes(9));

    const backLive = page.connections.lastIndexOf('live') > page.connections.indexOf('ended');
    expect(backLive).toBe(true);
  });

  it('a goodbye is reported once, with its reason, and the stream is not read past it', async () => {
    new SomethingOnThePort({ answering: 'the real server' }).willSayGoodbye('bye for now');
    const reasons: string[] = [];
    running.push(
      new HttpWorkbenchServer(SESSION, QUICK_RETRIES).follow({
        state: () => {},
        presence: () => {},
        connection: (connection) => {
          if (connection.kind === 'ended') {
            reasons.push(connection.reason);
          }
        },
      }),
    );

    await until(() => reasons.length > 0);

    expect(reasons).toEqual(['bye for now']);
  });
});
