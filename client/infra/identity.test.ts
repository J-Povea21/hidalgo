import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { pageOpenedOnItsPort, realProof, SESSION, SomethingOnThePort } from '@test/something-on-the-port.ts';
import { IDENTITY, proofFor, proveServer } from './identity.ts';

beforeEach(pageOpenedOnItsPort);
afterEach(() => vi.unstubAllGlobals());

describe('proving who answers on the page’s port', () => {
  it('the page computes the same proof as the server, for the same nonce, port and build', async () => {
    const pageProof = await proofFor(SESSION.token, 'a-nonce', '1234', 'build-1');

    expect(pageProof).toBe(realProof('a-nonce', '1234', 'build-1'));
  });

  it('the real server, on this page’s build, is proven', async () => {
    new SomethingOnThePort({ answering: 'the real server' });

    const identity = await proveServer(SESSION);

    expect(identity).toBe(IDENTITY.proven);
  });

  it('a stranger who can’t make the proof is not believed', async () => {
    new SomethingOnThePort({ answering: 'a stranger' });

    const identity = await proveServer(SESSION);

    expect(identity).toBe(IDENTITY.unproven);
  });

  it('an impostor relaying the real server’s proof from another port is not believed', async () => {
    new SomethingOnThePort({ answering: 'an impostor relaying the real proof' });

    const identity = await proveServer(SESSION);

    expect(identity).toBe(IDENTITY.unproven);
  });

  it('the real server on a newer build makes the page stale', async () => {
    new SomethingOnThePort({ answering: 'the real server', build: 'newer' });

    const identity = await proveServer(SESSION);

    expect(identity).toBe(IDENTITY.stale);
  });

  it('a stranger merely claiming a newer build is not believed, so no stale banner shows', async () => {
    new SomethingOnThePort({ answering: 'a stranger', build: 'newer' });

    const identity = await proveServer(SESSION);

    expect(identity).toBe(IDENTITY.unproven);
  });

  it('asking for the proof never sends the token', async () => {
    const port = new SomethingOnThePort({ answering: 'the real server' });

    await proveServer(SESSION);

    expect(port.receivedTheToken()).toBe(false);
  });
});
