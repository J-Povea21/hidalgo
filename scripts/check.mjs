// The single definition of every check. Run by `pnpm run check` and by the
// pre-push hook. Stops at the first failure.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const bin = (name) => join(root, 'node_modules', '.bin', name);
const run = (label, cmd, args, options = {}) => {
  process.stdout.write(`• ${label}… `);
  try {
    execFileSync(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    console.log('ok');
  } catch (error) {
    console.log('FAILED');
    process.stdout.write(String(error.stdout ?? ''));
    process.stderr.write(String(error.stderr ?? ''));
    process.exit(1);
  }
};
const fail = (msg) => {
  console.log('FAILED');
  console.error(msg);
  process.exit(1);
};

// 1. Dependencies pinned to exact versions.
process.stdout.write('• dependencies pinned… ');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const loose = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
  ([, version]) => !/^\d+\.\d+\.\d+$/.test(version),
);
if (loose.length) {
  fail(`not exact: ${loose.map(([name, version]) => `${name}@${version}`).join(', ')}`);
}
console.log('ok');

// 2. Install scripts stay off, and installs come from the committed lockfile.
process.stdout.write('• install scripts disabled… ');
if (!/^ignore-scripts=true$/m.test(readFileSync(join(root, '.npmrc'), 'utf8'))) {
  fail('.npmrc must set ignore-scripts=true');
}
if (!existsSync(join(root, 'pnpm-lock.yaml'))) {
  fail('pnpm-lock.yaml is missing: install with pnpm, never npm');
}
if (existsSync(join(root, 'package-lock.json'))) {
  fail('package-lock.json found: this package is installed with pnpm only');
}
console.log('ok');

// 3. Architecture rules. A cruise that reads nothing passes vacuously (it did once,
//    when dependency-cruiser couldn't load TypeScript 7), so the module count is checked too.
process.stdout.write('• dependency rules… ');
{
  let report;
  try {
    report = JSON.parse(
      execFileSync(
        bin('depcruise'),
        ['--config', 'config/dependency-cruiser.cjs', '--output-type', 'json', 'server', 'client', 'shared'],
        { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    );
  } catch (error) {
    report = JSON.parse(String(error.stdout || '{}'));
  }
  const summary = report.summary ?? {};
  if (!summary.totalCruised || summary.totalCruised < 10) {
    fail(`dependency-cruiser read only ${summary.totalCruised ?? 0} modules: the rules checked nothing`);
  }
  if (summary.violations?.length) {
    fail(
      summary.violations.map((violation) => `  ${violation.rule.name}: ${violation.from} → ${violation.to}`).join('\n'),
    );
  }
  console.log(`ok (${summary.totalCruised} modules)`);
}

// 4. Types.
run('types', bin('tsc'), ['--noEmit', '-p', 'tsconfig.json']);

// 4b. Style: formatted as Prettier writes it, and the naming rules ESLint enforces
//     (docs/conventions.md). `pnpm run format` fixes the first.
run('format', bin('prettier'), ['--check', '.']);
run('lint', bin('eslint'), ['--config', 'config/eslint.config.mjs', '--max-warnings', '0', '.']);

// 5. Tests.
run('tests', bin('vitest'), ['run', '--config', 'config/vitest.config.ts']);

// 6. Known vulnerabilities.
// One fixed command string through the shell, so Windows finds pnpm.cmd too.
run('audit', 'pnpm audit --audit-level high', [], { shell: true });

// 7. The committed bundle is exactly what the lockfile and sources produce.
process.stdout.write('• bundle reproducible… ');
const out = mkdtempSync(join(tmpdir(), 'workbench-build-'));
try {
  execFileSync('node', [join(root, 'scripts', 'build.mjs'), '--out', out], { cwd: root, stdio: 'pipe' });
  const list = (dir) =>
    readdirSync(dir, { recursive: true })
      .map(String)
      .filter((path) => statSync(join(dir, path)).isFile())
      .sort();
  const dist = join(root, 'dist');
  const committed = list(dist),
    fresh = list(out);
  if (committed.join('\n') !== fresh.join('\n')) {
    fail(
      `dist/ files differ from a fresh build.\n committed: ${committed.join(', ')}\n fresh:     ${fresh.join(', ')}\nRun pnpm run build and commit dist/.`,
    );
  }
  const changed = committed.filter((path) => !readFileSync(join(dist, path)).equals(readFileSync(join(out, path))));
  if (changed.length) {
    fail(`dist/ is stale or edited by hand: ${changed.join(', ')}\nRun pnpm run build and commit dist/.`);
  }
  console.log('ok');

  // 8. Size budget: what the page loads before any diagram appears. app.js plus
  //    every chunk it imports statically; chunks behind import() (Mermaid) don't count.
  process.stdout.write('• size budget… ');
  const BUDGET_KB = { script: 150, styles: 30 };
  const client = join(dist, 'client');
  const seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) {
      return;
    }
    seen.add(rel);
    const src = readFileSync(join(client, rel), 'utf8');
    const dynamic = new Set([...src.matchAll(/import\(\s*"([^"]+)"\s*\)/g)].map((match) => match[1]));
    for (const match of src.matchAll(/from\s*"(\.{1,2}\/[^"]+)"/g)) {
      if (dynamic.has(match[1])) {
        continue;
      }
      walk(join(rel, '..', match[1]).replace(/^\.\//, ''));
    }
  };
  walk('app.js');
  const scriptKb = [...seen].reduce((total, file) => total + statSync(join(client, file)).size, 0) / 1024;
  const stylesKb = statSync(join(client, 'styles.css')).size / 1024;
  if (scriptKb > BUDGET_KB.script) {
    fail(`first-load script is ${scriptKb.toFixed(0)} KB over ${seen.size} file(s); budget ${BUDGET_KB.script} KB`);
  }
  if (stylesKb > BUDGET_KB.styles) {
    fail(`styles.css is ${stylesKb.toFixed(0)} KB; budget ${BUDGET_KB.styles} KB`);
  }
  console.log(
    `ok (first load: ${scriptKb.toFixed(0)} KB script in ${seen.size} file(s), ${stylesKb.toFixed(0)} KB styles)`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

console.log(`\nworkbench: all checks passed (${relative(process.cwd(), root) || '.'})`);
