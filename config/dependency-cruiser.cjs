/**
 * The architecture as rules. `pnpm run check` fails on any violation, so the
 * layering in docs/conventions.md is enforced rather than remembered.
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
      name: 'modules-are-independent',
      comment: 'a module never imports another module; what two modules share lives in common/',
      severity: 'error',
      from: { path: '^server/(runs|items|conversation|page-events)/' },
      to: { path: '^server/(runs|items|conversation|page-events)/', pathNot: '^server/$1/' },
    },
    {
      name: 'common-imports-no-module',
      comment: 'common/ is what the modules share, so it can know none of them',
      severity: 'error',
      from: { path: '^server/common/' },
      to: { path: '^server/(runs|items|conversation|page-events|app)/' },
    },
    {
      name: 'only-app-wires-the-server',
      comment: 'nothing but server/app imports server/app: it is the composition root',
      severity: 'error',
      from: { path: '^server/', pathNot: '^server/app/' },
      to: { path: '^server/app/' },
    },
    {
      name: 'domain-is-pure',
      comment: 'domain and ports know nothing about use cases, adapters, MCP or the browser',
      severity: 'error',
      from: { path: '^server/[^/]+/(domain|ports)/' },
      to: { path: '^(server/[^/]+/(application|infrastructure|interface)|server/app|client)/' },
    },
    {
      name: 'domain-uses-no-node-builtins',
      severity: 'error',
      from: { path: '^server/[^/]+/(domain|ports)/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'use-cases-do-not-touch-adapters',
      comment: 'use cases reach the outside world only through ports, and know nothing of the tools that call them',
      severity: 'error',
      from: { path: '^server/[^/]+/application/' },
      to: { path: '^server/[^/]+/(infrastructure|interface)/' },
    },
    {
      name: 'use-cases-use-no-node-builtins',
      comment: 'disk, network and processes are reached through ports, never directly',
      severity: 'error',
      from: { path: '^server/[^/]+/application/' },
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
      name: 'client-domain-is-pure',
      comment: 'client/domain holds state and ports only: no features, views, network or browser adapters',
      severity: 'error',
      from: { path: '^client/domain/' },
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
    // Resolves the @shared, @server, @client and @test aliases the same way TypeScript does.
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
