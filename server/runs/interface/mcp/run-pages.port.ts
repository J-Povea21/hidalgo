import type { RunState } from '@shared/contract.ts';

/** What open_session needs once the run exists: its page shown to the user. */
export abstract class RunPages {
  /**
   * Serves the run and shows its page: tells a tab already connected to it, or opens a new one.
   * Returns what the tool result says about that (opened, alreadyOpen) and, for a resumed run,
   * the page events Claude hadn't seen.
   */
  abstract show(run: RunState, resumed: boolean): Promise<object>;
}
