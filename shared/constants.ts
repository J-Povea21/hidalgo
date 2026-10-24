/**
 * Values both sides need at runtime. Kept apart from contract.ts so the page
 * imports no schemas: the client takes only types from the contract, which
 * vanish at build time, and zod stays out of the browser.
 */
export const TOKEN_HEADER = 'x-workbench-token';
