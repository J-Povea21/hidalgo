/**
 * Values both sides need at runtime. Kept apart from contract.ts so the page
 * imports no schemas: the client takes only types from the contract, which
 * vanish at build time, and zod stays out of the browser.
 */
export const TOKEN_HEADER = 'x-workbench-token';

declare const __WORKBENCH_BUILD__: string | undefined;

/**
 * Which build of workbench this code is: a hash of the sources, set by
 * scripts/build.mjs in both bundles. A page whose build differs from its
 * server's was opened before an update, and is told to reload. "dev" when
 * running from source (tests).
 */
export const BUILD: string = typeof __WORKBENCH_BUILD__ === 'string' ? __WORKBENCH_BUILD__ : 'dev';
