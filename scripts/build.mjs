// Builds dist/: the MCP server, the Stop hook, and the page. Deterministic, so
// `pnpm run check` can rebuild into a temp folder and compare byte for byte.
//   node scripts/build.mjs [--out <dir>]
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(root, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'client'), { recursive: true });

// The build id both bundles carry: a hash of every source file, so it changes exactly when
// the code does, and stays the same on every rebuild of the same sources (check compares bytes).
const hash = createHash('sha256');
for (const dir of ['shared', 'server', 'client']) {
  for (const rel of readdirSync(join(root, dir), { recursive: true }).map(String).sort()) {
    const file = join(root, dir, rel);
    if (statSync(file).isFile() && !/\.test\.tsx?$/.test(rel)) {
      hash.update(rel).update(readFileSync(file));
    }
  }
}
const BUILD = hash.digest('hex').slice(0, 12);

const common = {
  bundle: true,
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  absWorkingDir: root,
  charset: 'utf8',
  define: { __WORKBENCH_BUILD__: JSON.stringify(BUILD) },
};

// Node targets: one self-contained file each, no node_modules needed at runtime.
const nodeTarget = {
  ...common,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // Some dependencies are CommonJS and call require(); give ESM a require.
  banner: {
    js: "import { createRequire as __wbRequire } from 'node:module'; const require = __wbRequire(import.meta.url);",
  },
};
await build({ ...nodeTarget, entryPoints: ['server/app/main.ts'], outfile: join(out, 'server.mjs') });
await build({
  ...nodeTarget,
  entryPoints: ['server/runs/interface/hooks/stop-hook.ts'],
  outfile: join(out, 'stop-hook.mjs'),
});

// The page: app.js loads first; Mermaid and its parts are split out and load only when a diagram appears.
await build({
  ...common,
  platform: 'browser',
  target: ['chrome120', 'firefox121', 'safari17'],
  format: 'esm',
  splitting: true,
  entryPoints: { app: 'client/app/main.tsx' },
  outdir: join(out, 'client'),
  chunkNames: 'chunks/[name]-[hash]',
  jsx: 'automatic',
  jsxImportSource: 'preact',
});
copyFileSync(join(root, 'client', 'index.html'), join(out, 'client', 'index.html'));
copyFileSync(join(root, 'client', 'common', 'interface', 'ui', 'styles.css'), join(out, 'client', 'styles.css'));
