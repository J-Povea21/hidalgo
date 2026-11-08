// Builds dist/: the MCP server, the Stop hook, and the page. Deterministic, so
// `pnpm run check` can rebuild into a temp folder and compare byte for byte.
//   node scripts/build.mjs [--out <dir>]
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Third-party code bundled into dist/ ships with its license here, which MIT, Apache-2.0 and
// MPL-2.0 all ask of a copy. esbuild drops license comments (legalComments: none), and
// many packages only carry a LICENSE file, so the notices come from node_modules instead.
const LICENSES_FILE = 'THIRD_PARTY_LICENSES.txt';
const LICENSE_FILE_NAME = /^licen[cs]e(\.[a-z]+)?$/i;
const NODE_MODULES = 'node_modules/';
const RULE = '='.repeat(80);
const GITHUB_SHORTHAND = /^(?:github:)?([\w.-]+\/[\w.-]+)$/;

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
  define: { __HIDALGO_BUILD__: JSON.stringify(BUILD) },
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
const metafiles = [];
const bundle = async (options) => metafiles.push((await build({ ...options, metafile: true })).metafile);

await bundle({ ...nodeTarget, entryPoints: ['server/app/main.ts'], outfile: join(out, 'server.mjs') });
await bundle({
  ...nodeTarget,
  entryPoints: ['server/runs/interface/hooks/stop-hook.ts'],
  outfile: join(out, 'stop-hook.mjs'),
});

// The page: app.js loads first; Mermaid and its parts are split out and load only when a diagram appears.
await bundle({
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
writeFileSync(join(out, LICENSES_FILE), thirdPartyLicenses(metafiles));

/** The folder of the package an input file belongs to, or undefined for our own sources. */
function packageDirOf(input) {
  const at = input.lastIndexOf(NODE_MODULES);
  if (at < 0) {
    return undefined;
  }
  const parts = input.slice(at + NODE_MODULES.length).split('/');
  const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  return input.slice(0, at + NODE_MODULES.length) + name;
}

/** Where a package's source lives, as a browsable address: EPL-2.0 (elkjs) asks for it. */
function sourceOf(manifest) {
  const given = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
  if (given === undefined) {
    return manifest.homepage ?? 'not given';
  }
  const shorthand = GITHUB_SHORTHAND.exec(given);
  if (shorthand !== null) {
    return `https://github.com/${shorthand[1]}`;
  }
  return given
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '');
}

/** Every bundled package with its license text, sorted so a rebuild writes the same bytes. */
function thirdPartyLicenses(builds) {
  const dirs = new Set(
    builds
      .flatMap((metafile) => Object.keys(metafile.inputs))
      .map(packageDirOf)
      .filter((dir) => dir !== undefined),
  );
  const entries = [...dirs]
    .map((dir) => {
      const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
      const licenseFile = readdirSync(join(root, dir))
        .filter((name) => LICENSE_FILE_NAME.test(name))
        .sort()[0];
      const text =
        licenseFile === undefined
          ? `The package ships no license file; its package.json declares ${manifest.license ?? 'no license'}.`
          : readFileSync(join(root, dir, licenseFile), 'utf8')
              .replace(/\r\n/g, '\n')
              .trim();
      return {
        id: `${manifest.name}@${manifest.version}`,
        license: manifest.license ?? 'not declared',
        source: sourceOf(manifest),
        text,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const header = [
    'Third-party software bundled into dist/',
    '',
    `${entries.length} packages. Each entry gives the package, its version, the license its`,
    'package.json declares, where its source lives, and the license text it ships.',
    'Generated by scripts/build.mjs.',
  ];
  const body = entries.map((entry) =>
    [RULE, `${entry.id} (${entry.license})`, `Source: ${entry.source}`, RULE, '', entry.text].join('\n'),
  );
  return `${[header.join('\n'), ...body].join('\n\n')}\n`;
}
