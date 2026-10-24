// Points git at the committed hooks, so the pre-push check is active for anyone
// who has built, tested or checked workbench once. Idempotent and silent.
//
// It can't run on `npm install`: .npmrc sets ignore-scripts=true so no
// dependency runs code at install, and npm has no way to exempt our own
// prepare script from that.
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hooksDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '.githooks');

try {
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const want = relative(top, hooksDir);
  let current = '';
  try {
    current = execFileSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim();
  } catch {
    // unset
  }
  if (current === '') {
    execFileSync('git', ['config', 'core.hooksPath', want]);
  } else if (current !== want) {
    // Someone already chose their own hooks; never silently replace them.
    console.warn(`workbench: core.hooksPath is "${current}", so the pre-push check in ${want} is not active. ` +
      `Call ${want}/pre-push from your own hook to enable it.`);
  }
} catch {
  // Not inside a git checkout (e.g. an installed plugin copy): nothing to wire.
}
