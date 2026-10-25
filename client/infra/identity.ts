/**
 * Proving that the server answering on this port holds the run's token, without sending
 * it: the page sends a random nonce, and only the real server can answer with
 * HMAC(token, "workbench-hello|nonce|port|build"). A proof relayed from another port fails,
 * and a claim of a newer build counts only when proven.
 */
import { BUILD } from '@shared/constants.ts';
import type { Session } from './session.ts';

export const IDENTITY = {
  /** The real server, on this page's build: the token may be sent. */
  proven: 'proven',
  /** The real server, on a newer build: this page predates an update and must be reloaded. */
  stale: 'stale',
  /** Nothing answered, or something that isn't this run's server. */
  unproven: 'unproven',
} as const;
export type Identity = (typeof IDENTITY)[keyof typeof IDENTITY];

/** FROZEN: pages from older builds must be able to verify newer servers with it. Mirrors server/infra/http/app.ts. */
const proofMessage = (nonce: string, port: string, build: string) => `workbench-hello|${nonce}|${port}|${build}`;

const NONCE_BYTES = 16;

interface HelloAnswer {
  server?: string;
  run?: string;
  build?: string;
  proof?: string;
}

export async function proveServer(session: Session): Promise<Identity> {
  try {
    const nonce = toHex(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)).buffer);
    const response = await fetch(`/api/hello?run=${encodeURIComponent(session.runId)}&nonce=${nonce}`);
    if (!response.ok) {
      return IDENTITY.unproven;
    }
    const answer: HelloAnswer = await response.json();
    const isWorkbenchForThisRun = answer.server === 'workbench' && answer.run === session.runId;
    if (!isWorkbenchForThisRun || !answer.build || !answer.proof) {
      return IDENTITY.unproven;
    }
    // Nothing in the answer is trusted until the proof, which covers the build, checks out.
    const expected = await proofFor(session.token, nonce, pagePort(), answer.build);
    if (answer.proof !== expected) {
      return IDENTITY.unproven;
    }
    return answer.build === BUILD ? IDENTITY.proven : IDENTITY.stale;
  } catch {
    return IDENTITY.unproven;
  }
}

/** HMAC-SHA256 of the proof message, keyed with the run's token, as lowercase hex. */
export async function proofFor(token: string, nonce: string, port: string, build: string): Promise<string> {
  const encode = (text: string) => new TextEncoder().encode(text);
  const key = await crypto.subtle.importKey('raw', encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encode(proofMessage(nonce, port, build)));
  return toHex(signature);
}

/** The port this page is talking to: the address bar's, or the scheme's default when it shows none. */
function pagePort(): string {
  if (location.port) {
    return location.port;
  }
  return location.protocol === 'https:' ? '443' : '80';
}

/** Bytes as lowercase hex, two characters per byte. */
function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
