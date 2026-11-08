// The pre-push gate, in Node so it runs the same on macOS, Linux and Windows.
// .githooks/pre-push hands over to this script.
//
// Runs every check before a push. Until there is CI this is the gate, and
// `git push --no-verify` skips it.
import { execFileSync, spawnSync } from 'node:child_process';

const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

console.log('hidalgo: running pnpm run check before push...');
// One command string through the shell, so Windows finds pnpm.cmd too. Only the checkout's own path is in it, quoted.
const check = spawnSync(`pnpm --dir "${top}" run --silent check`, { stdio: 'inherit', shell: true });
if (check.status !== 0) {
  console.error('hidalgo: checks failed, push blocked. Fix them, or push with --no-verify to skip.');
  process.exit(1);
}
