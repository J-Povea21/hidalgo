/**
 * The fixed sets of values a run is made of, as constants: code compares against
 * `VERDICT.approved`, never against a bare string. The types are derived from them.
 * Imports nothing, so the page can use them without pulling in a schema library.
 */

export const VERDICT = { approved: 'approved', rejected: 'rejected', pending: 'pending' } as const;
export type VerdictValue = (typeof VERDICT)[keyof typeof VERDICT];

export const RUN_STATUS = { open: 'open', paused: 'paused', closed: 'closed' } as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

/** The two sides of a run: who wrote a message, and whose move it is (the page shows more nuance, client/domain/selectors.ts). */
export const PARTY = { user: 'user', claude: 'claude' } as const;
export type Party = (typeof PARTY)[keyof typeof PARTY];
export type Turn = Party;

/** Where an item stands, as the page shows it and the server counts it. */
export const ITEM_STATUS = {
  questions: 'questions',
  ready: 'ready',
  approved: 'approved',
  done: 'done',
  rejected: 'rejected',
  pending: 'pending',
} as const;
export type ItemStatus = (typeof ITEM_STATUS)[keyof typeof ITEM_STATUS];
