// Builds dist/: the MCP server, the Stop hook, and the page. Deterministic, so
// `npm run check` can rebuild into a temp folder and compare byte for byte.
//   node scripts/build.mjs [--out <dir>]
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(root, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'client'), { recursive: true });

const common = { bundle: true, minify: true, legalComments: 'none', logLevel: 'warning', absWorkingDir: root, charset: 'utf8' };

// Node targets: one self-contained file each, no node_modules needed at runtime.
const nodeTarget = {
  ...common,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // Some dependencies are CommonJS and call require(); give ESM a require.
  banner: { js: "import { createRequire as __wbRequire } from 'node:module'; const require = __wbRequire(import.meta.url);" },
};
await build({ ...nodeTarget, entryPoints: ['server/infra/main.ts'], outfile: join(out, 'server.mjs') });
await build({ ...nodeTarget, entryPoints: ['server/infra/hooks/stop-hook.ts'], outfile: join(out, 'stop-hook.mjs') });

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
copyFileSync(join(root, 'client', 'ui', 'styles.css'), join(out, 'client', 'styles.css'));
