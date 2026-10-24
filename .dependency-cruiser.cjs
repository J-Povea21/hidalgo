/**
 * The architecture as rules. `npm run check` fails on any violation, so the
 * layering in docs/workbench/design.md is enforced rather than remembered.
 */
module.exports = {
  forbidden: [
    {
      name: 'shared-imports-nothing',
      comment: 'shared/ is the contract both halves import; it may depend on nothing of ours',
      severity: 'error',
      from: { path: '^shared/' },
      to: { path: '^(server|client)/' },
    },
    {
      name: 'kernel-is-pure',
      comment: 'the kernel knows nothing about slices, adapters, Node or the browser',
      severity: 'error',
      from: { path: '^server/kernel/' },
      to: { path: '^(server/(features|infra)|client)/' },
    },
    {
      name: 'kernel-uses-no-node-builtins',
      severity: 'error',
      from: { path: '^server/kernel/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'slices-are-independent',
      comment: 'a feature slice never imports another slice',
      severity: 'error',
      from: { path: '^server/features/([^/]+)/' },
      to: { path: '^server/features/', pathNot: '^server/features/$1/' },
    },
    {
      name: 'slices-do-not-touch-infra',
      comment: 'slices reach the outside world only through ports',
      severity: 'error',
      from: { path: '^server/features/' },
      to: { path: '^server/infra/' },
    },
    {
      name: 'slices-use-no-node-builtins',
      comment: 'disk, network and processes are reached through ports, never directly',
      severity: 'error',
      from: { path: '^server/features/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'client-never-imports-server',
      severity: 'error',
      from: { path: '^client/' },
      to: { path: '^server/' },
    },
    {
      name: 'server-never-imports-client',
      severity: 'error',
      from: { path: '^server/' },
      to: { path: '^client/' },
    },
    {
      name: 'client-core-is-pure',
      comment: 'client/core holds state only: no features, views, network or browser adapters',
      severity: 'error',
      from: { path: '^client/core/' },
      to: { path: '^client/(features|kinds|infra|ui|app)/' },
    },
    {
      name: 'client-slices-are-independent',
      severity: 'error',
      from: { path: '^client/features/([^/]+)/' },
      to: { path: '^client/features/', pathNot: '^client/features/$1/' },
    },
    {
      name: 'only-app-wires-everything',
      comment: 'nothing but client/app imports client/app',
      severity: 'error',
      from: { path: '^client/', pathNot: '^client/app/' },
      to: { path: '^client/app/' },
    },
    {
      name: 'client-takes-only-types-from-the-contract',
      comment: 'a value import from shared/contract.ts would ship every zod schema to the browser',
      severity: 'error',
      from: { path: '^client/' },
      to: { path: '^shared/contract\\.ts$', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist)/|\\.test\\.tsx?$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
