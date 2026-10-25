// The pre-push gate, in Node so it runs the same on macOS, Linux and Windows.
// .githooks/pre-push only hands git's input to this script.
//
// Runs workbench's checks when the push touches servers/workbench/; any other push
// passes straight through. Until the team has CI this is the gate, and
// `git push --no-verify` skips it.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const NO_COMMIT = /^0+$/;
const WORKBENCH = 'servers/workbench';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** Where the pushed commits start: the remote's tip, or where a new branch left main. */
function baseOf(localSha, remoteSha) {
  if (!NO_COMMIT.test(remoteSha)) return remoteSha;
  try {
    return git('merge-base', localSha, 'origin/main');
  } catch {
    return git('rev-list', '--max-parents=0', localSha).split('\n').at(-1);
  }
}

// git writes one line per pushed ref: `<local ref> <local sha> <remote ref> <remote sha>`.
const pushedRefs = readFileSync(0, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => line.split(' '))
  .map(([, localSha, , remoteSha]) => ({ localSha, remoteSha }))
  .filter(({ localSha }) => !NO_COMMIT.test(localSha));

const touchesWorkbench = pushedRefs.some(
  ({ localSha, remoteSha }) =>
    git('diff', '--name-only', baseOf(localSha, remoteSha), localSha, '--', WORKBENCH) !== '',
);
if (!touchesWorkbench) process.exit(0);

console.log('workbench: running pnpm run check before push...');
const top = git('rev-parse', '--show-toplevel');
// One command string through the shell, so Windows finds pnpm.cmd too. Only the checkout's own path is in it, quoted.
const check = spawnSync(`pnpm --dir "${top}/${WORKBENCH}" run --silent check`, { stdio: 'inherit', shell: true });
if (check.status !== 0) {
  console.error('workbench: checks failed, push blocked. Fix them, or push with --no-verify to skip.');
  process.exit(1);
}
