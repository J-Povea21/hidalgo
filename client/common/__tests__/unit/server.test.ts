import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageOpenedOnItsPort, SESSION, SomethingOnThePort } from '@test/something-on-the-port.ts';
import { NotConnectedError } from '@client/common/domain/errors.ts';
import { HttpWorkbenchServer } from '@client/common/infrastructure/server.ts';

beforeEach(pageOpenedOnItsPort);
afterEach(() => vi.unstubAllGlobals());

describe('when the page sends the token', () => {
  it('not before the server proved itself: the request is refused in the page', async () => {
    const port = new SomethingOnThePort({ answering: 'the real server' });
    const server = new HttpWorkbenchServer(SESSION);

    const request = server.liveRuns();

    await expect(request).rejects.toBeInstanceOf(NotConnectedError);
    expect(port.receivedTheToken()).toBe(false);
  });

  it('never to a stranger, even after it was asked to prove itself', async () => {
    const port = new SomethingOnThePort({ answering: 'a stranger' });
    const server = new HttpWorkbenchServer(SESSION);

    await server.prove();
    const request = server.liveRuns();

    await expect(request).rejects.toBeInstanceOf(NotConnectedError);
    expect(port.receivedTheToken()).toBe(false);
  });

  it('to the real server, once it proved itself', async () => {
    const port = new SomethingOnThePort({ answering: 'the real server' });
    const server = new HttpWorkbenchServer(SESSION);

    await server.prove();
    await server.liveRuns();

    expect(port.receivedTheToken()).toBe(true);
  });

  it('not again after the server was forgotten (a stream ended): it must prove itself again', async () => {
    new SomethingOnThePort({ answering: 'the real server' });
    const server = new HttpWorkbenchServer(SESSION);

    await server.prove();
    server.forget();
    const request = server.liveRuns();

    await expect(request).rejects.toBeInstanceOf(NotConnectedError);
  });
});
