// Points git at the committed hooks, so the pre-push check is active from the first
// `pnpm install` (it is the package's `prepare` script). Idempotent and silent.
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hooksDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '.githooks');

try {
  // Inside a git hook, GIT_DIR is set and skews paths; the hook running proves it's wired.
  if (process.env.GIT_DIR) {
    process.exit(0);
  }
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
  } else if (resolve(top, current) !== hooksDir) {
    // Someone already chose their own hooks; never silently replace them.
    console.warn(
      `workbench: core.hooksPath is "${current}", so the pre-push check in ${want} is not active. ` +
        `Call ${want}/pre-push from your own hook to enable it.`,
    );
  }
} catch {
  // Not inside a git checkout (e.g. an installed plugin copy): nothing to wire.
}
