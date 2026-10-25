import type { RunState } from '@shared/contract.ts';

/** Where runs are kept between calls and across sessions. */
export abstract class RunStore {
  abstract load(runId: string): Promise<RunState | undefined>;
  abstract save(run: RunState): Promise<void>;
  /** Every run on disk for a project, newest first; every project when omitted. */
  abstract list(project?: string): Promise<RunState[]>;
  /** Removes a run's folder: state, log and images. */
  abstract remove(runId: string): Promise<void>;
}
