/** What list-runs needs from outside, and nothing else does: which runs have a page served right now. */
import type { LiveEntry } from '@shared/contract.ts';

export interface LiveIndex {
  /** Entries whose server is alive; dead ones are cleared on the way. */
  alive(): Promise<LiveEntry[]>;
}
